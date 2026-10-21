<?php

declare(strict_types=1);

namespace App\Model;

use GdImage;
use InvalidArgumentException;
use RuntimeException;

/**
 * Photos des bijoux envoyées depuis le back-office (US GOF-a).
 *
 * Le fichier reçu n'est jamais conservé tel quel : il est vérifié, relu par GD,
 * recadré au carré puis réécrit en WebP à deux tailles (800 px et 400 px, comme
 * les photos du catalogue). Un fichier piégé (script déguisé en image, métadonnées
 * malveillantes) ne survit donc pas au traitement, et le dossier ne contient que
 * des .webp.
 *
 * Les photos vont dans uploads/produits/, à la racine du dépôt et non dans
 * front/dist/ : npm run build vide ce dossier et effacerait les envois.
 */
final class ProductImageStorage
{
    /** Préfixe, depuis la racine du site, des photos envoyées. Il est enregistré dans image_produit.fichier. */
    public const URL_PREFIX = 'uploads/produits/';

    /** Taille maximale du fichier reçu, en octets (celle de upload_max_filesize sur le serveur). */
    public const MAX_BYTES = 2097152;

    /** Côté le plus court minimal : en dessous, la photo serait floue à 800 px. */
    private const MIN_SIDE = 400;

    /** Nombre maximal de pixels : GD charge l'image entière en mémoire, à 4 octets par pixel. */
    private const MAX_PIXELS = 16000000;

    /** Côté des deux versions écrites. */
    private const SIZE_FULL  = 800;
    private const SIZE_SMALL = 400;

    /** Qualité WebP (0 à 100). */
    private const QUALITY = 80;

    /** Types acceptés, d'après le contenu du fichier et non son extension. */
    private const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    /** Dossier d'écriture sur le disque, fourni à la construction. */
    private string $directory;

    /**
     * @param string $directory Chemin absolu du dossier uploads/produits.
     */
    public function __construct(string $directory)
    {
        $this->directory = rtrim($directory, '/');
    }

    /**
     * Vérifie une photo envoyée, la convertit et l'enregistre.
     *
     * @param array{name: string, tmp_name: string, error: int, size: int} $upload Entrée de $_FILES.
     * @param string                                                         $slug   Slug du bijou, base du nom de fichier.
     * @return string Valeur à enregistrer dans image_produit.fichier (par exemple
     *                « uploads/produits/bague-ginkgo-3fa9c1d2 »), sans extension.
     * @throws InvalidArgumentException Si la photo est refusée ; le message est destiné à l'utilisateur.
     * @throws RuntimeException         Si le disque ne permet pas l'écriture.
     */
    public function store(array $upload, string $slug): string
    {
        $source = $this->readUpload($upload);

        $name = $slug . '-' . bin2hex(random_bytes(4));
        $base = $this->directory . '/' . $name;

        if (!is_dir($this->directory) && !mkdir($this->directory, 0755, true) && !is_dir($this->directory)) {
            throw new RuntimeException('Le dossier des photos ne peut pas être créé.');
        }

        try {
            self::writeSquare($source, self::SIZE_FULL, $base . '.webp');
            self::writeSquare($source, self::SIZE_SMALL, $base . '-400.webp');
        } catch (RuntimeException $e) {
            self::removeFiles($base);
            throw $e;
        }

        return self::URL_PREFIX . $name;
    }

    /**
     * Supprime les deux fichiers d'une photo envoyée. Une photo du catalogue
     * d'origine (front/public/images/produits/) n'est jamais touchée, et un
     * nom qui sortirait du dossier est ignoré.
     *
     * @param string $fichier Valeur de image_produit.fichier.
     * @return void
     */
    public function delete(string $fichier): void
    {
        if (!self::isUploaded($fichier)) {
            return;
        }

        self::removeFiles($this->directory . '/' . substr($fichier, strlen(self::URL_PREFIX)));
    }

    /**
     * Indique si une valeur de image_produit.fichier désigne une photo envoyée
     * depuis le back-office (et non une photo du catalogue d'origine).
     *
     * @param string $fichier Valeur de image_produit.fichier.
     * @return bool
     */
    public static function isUploaded(string $fichier): bool
    {
        return preg_match('#^' . preg_quote(self::URL_PREFIX, '#') . '[a-z0-9-]+$#', $fichier) === 1;
    }

    /**
     * Contrôle le fichier reçu et le charge en mémoire.
     *
     * @param array{name: string, tmp_name: string, error: int, size: int} $upload Entrée de $_FILES.
     * @return GdImage L'image décodée, orientée comme sur la photo d'origine.
     * @throws InvalidArgumentException Si le fichier est refusé.
     */
    private function readUpload(array $upload): GdImage
    {
        if ($upload['error'] === UPLOAD_ERR_INI_SIZE || $upload['error'] === UPLOAD_ERR_FORM_SIZE) {
            throw new InvalidArgumentException('La photo est trop lourde (2 Mo au maximum).');
        }
        if ($upload['error'] !== UPLOAD_ERR_OK) {
            throw new InvalidArgumentException('La photo n\'a pas pu être envoyée. Réessayez.');
        }
        // Un nom de fichier fabriqué ne doit pas faire lire un autre fichier du serveur.
        if (!is_uploaded_file($upload['tmp_name'])) {
            throw new InvalidArgumentException('Envoi de photo invalide.');
        }
        if ($upload['size'] > self::MAX_BYTES) {
            throw new InvalidArgumentException('La photo est trop lourde (2 Mo au maximum).');
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $type  = $finfo === false ? false : finfo_file($finfo, $upload['tmp_name']);

        if (!is_string($type) || !in_array($type, self::ALLOWED_TYPES, true)) {
            throw new InvalidArgumentException('Format de photo non accepté : utilisez un JPEG, un PNG ou un WebP.');
        }

        $size = getimagesize($upload['tmp_name']);

        // Contrôle des dimensions avant de décoder, pour ne pas charger une
        // image gigantesque en mémoire.
        if ($size === false) {
            throw new InvalidArgumentException('Le fichier envoyé n\'est pas une image lisible.');
        }
        if (min($size[0], $size[1]) < self::MIN_SIDE) {
            throw new InvalidArgumentException('La photo est trop petite : ' . self::MIN_SIDE . ' px au minimum sur le plus petit côté.');
        }
        if ($size[0] * $size[1] > self::MAX_PIXELS) {
            throw new InvalidArgumentException('La photo est trop grande : réduisez-la (16 mégapixels au maximum).');
        }

        $contents = file_get_contents($upload['tmp_name']);
        $image    = $contents === false ? false : @imagecreatefromstring($contents);

        if ($image === false) {
            throw new InvalidArgumentException('Le fichier envoyé n\'est pas une image lisible.');
        }

        return $type === 'image/jpeg' ? self::applyExifOrientation($image, $upload['tmp_name']) : $image;
    }

    /**
     * Remet une photo de téléphone à l'endroit : les appareils enregistrent la
     * photo couchée et notent le sens dans les métadonnées EXIF, que GD ignore.
     *
     * @param GdImage $image Image décodée.
     * @param string  $path  Fichier JPEG d'origine, qui porte les métadonnées.
     * @return GdImage L'image tournée si besoin.
     */
    private static function applyExifOrientation(GdImage $image, string $path): GdImage
    {
        if (!function_exists('exif_read_data')) {
            return $image;
        }

        $exif        = @exif_read_data($path);
        $orientation = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;
        $angles      = [3 => 180, 6 => -90, 8 => 90];

        if (!isset($angles[$orientation])) {
            return $image;
        }

        $rotated = imagerotate($image, $angles[$orientation], 0);

        return $rotated === false ? $image : $rotated;
    }

    /**
     * Écrit une version carrée de l'image : recadrage centré, puis réduction.
     *
     * @param GdImage $source Image d'origine.
     * @param int     $side   Côté de la version à écrire, en pixels.
     * @param string  $path   Fichier .webp à écrire.
     * @return void
     * @throws RuntimeException Si l'écriture échoue.
     */
    private static function writeSquare(GdImage $source, int $side, string $path): void
    {
        $width  = imagesx($source);
        $height = imagesy($source);
        $crop   = min($width, $height);

        $target = imagecreatetruecolor($side, $side);

        if ($target === false) {
            throw new RuntimeException('La photo n\'a pas pu être traitée.');
        }

        // Transparence conservée pour les PNG détourés.
        imagealphablending($target, false);
        imagesavealpha($target, true);
        imagefill($target, 0, 0, imagecolorallocatealpha($target, 255, 255, 255, 127));

        $isCopied = imagecopyresampled(
            $target,
            $source,
            0,
            0,
            intdiv($width - $crop, 2),
            intdiv($height - $crop, 2),
            $side,
            $side,
            $crop,
            $crop
        );

        if (!$isCopied || !imagewebp($target, $path, self::QUALITY)) {
            throw new RuntimeException('La photo n\'a pas pu être enregistrée.');
        }
    }

    /**
     * Efface les deux versions d'une photo, sans erreur si elles manquent.
     *
     * @param string $base Chemin absolu sans extension ni suffixe de taille.
     * @return void
     */
    private static function removeFiles(string $base): void
    {
        @unlink($base . '.webp');
        @unlink($base . '-400.webp');
    }
}

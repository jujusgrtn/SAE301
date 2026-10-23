<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Lecture du journal des modifications des administrateurs (US PIL-b).
 *
 * L'écriture se fait dans la transaction de chaque modification (voir
 * AdminOrderModel) : cette classe ne fait que relire.
 */
final class AdminJournalModel
{
    /** Nombre d'entrées par page. */
    public const PER_PAGE = 30;

    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    /**
     * @param PDO $pdo Connexion ouverte par back/index.php.
     */
    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Une page du journal, les entrées les plus récentes d'abord. La page demandée est
     * ramenée à la dernière page existante.
     *
     * @param int $page Numéro de page demandé, à partir de 1.
     * @return array{entrees: array<int, array<string, mixed>>, total: int, page: int, parPage: int, pages: int}
     *         entrees : [{ id, date, administrateur, action, cible, statutAvant, statutApres, detail, lot }]
     */
    public function findPage(int $page): array
    {
        $total = (int) $this->pdo->query('SELECT COUNT(*) FROM journal_admin')->fetchColumn();
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page  = min(max(1, $page), $pages);

        $statement = $this->pdo->prepare(
            'SELECT id, date_action, identifiant, action, cible, statut_avant, statut_apres, detail, lot
               FROM journal_admin
           ORDER BY date_action DESC, id DESC
              LIMIT :limite OFFSET :decalage'
        );
        $statement->bindValue(':limite', self::PER_PAGE, PDO::PARAM_INT);
        $statement->bindValue(':decalage', ($page - 1) * self::PER_PAGE, PDO::PARAM_INT);
        $statement->execute();

        return [
            'entrees' => array_map(function (array $row): array {
                return [
                    'id'             => (int) $row['id'],
                    'date'           => $row['date_action'],
                    'administrateur' => $row['identifiant'],
                    'action'         => $row['action'],
                    'cible'          => $row['cible'],
                    'statutAvant'    => $row['statut_avant'],
                    'statutApres'    => $row['statut_apres'],
                    'detail'         => $row['detail'],
                    'lot'            => $row['lot'],
                ];
            }, $statement->fetchAll()),
            'total'   => $total,
            'page'    => $page,
            'parPage' => self::PER_PAGE,
            'pages'   => $pages,
        ];
    }
}

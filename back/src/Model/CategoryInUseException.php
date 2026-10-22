<?php

declare(strict_types=1);

namespace App\Model;

use RuntimeException;

/**
 * Une catégorie ne peut pas être supprimée parce qu'elle sert encore (US GOF-c).
 *
 * Elle contient des sous-catégories ou des bijoux. La requête est correcte
 * mais s'oppose à l'état de la base : le contrôleur répond 409, avec ce
 * message, destiné à l'utilisateur.
 */
final class CategoryInUseException extends RuntimeException
{
}

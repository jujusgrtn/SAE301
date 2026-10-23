<?php

declare(strict_types=1);

namespace App\Model;

use RuntimeException;

/**
 * Le changement de statut demandé n'est pas permis (US PIL-b).
 *
 * La requête est correcte mais s'oppose à l'état de la réservation : le
 * contrôleur répond 409, avec ce message destiné à l'écran.
 */
final class OrderTransitionException extends RuntimeException
{
}

<?php

declare(strict_types=1);

namespace App\Model;

use RuntimeException;

/**
 * Le stock ne permet pas l'opération demandée (US STK-c).
 *
 * Distincte d'InvalidArgumentException (requête mal formée, 400) : ici la
 * requête est correcte, mais elle entre en conflit avec l'état du stock
 * (409). Son message est destiné à l'utilisateur.
 */
final class StockException extends RuntimeException
{
}

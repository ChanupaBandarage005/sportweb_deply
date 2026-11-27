<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/tournament_tables.php';

const TOURNAMENT_STATUSES   = ['registration_open', 'upcoming', 'ongoing', 'completed', 'cancelled'];
const WITHDRAWABLE_STATUSES = ['registration_open', 'upcoming'];
const TOURNAMENT_COLUMNS    = 't.id, t.name, t.sport, t.start_date, t.end_date, t.venue, t.format, t.max_teams,
                               t.registered_teams, t.status, t.description, t.created_at, t.updated_at';

/* ------------------------------------------------------------------ helpers */

function shape_tournament(array $row): array
{
    $row['id']               = (int) $row['id'];
    $row['max_teams']        = (int) $row['max_teams'];
    $row['registered_teams'] = (int) $row['registered_teams'];
    $row['spots_left']       = max(0, $row['max_teams'] - $row['registered_teams']);
    $row['is_registered']    = !empty($row['is_registered']);
    return $row;
}

function tournament_select(string $where): string
{
    return 'SELECT ' . TOURNAMENT_COLUMNS . ',
                   r.team_name AS my_team_name,
                   (r.id IS NOT NULL) AS is_registered
            FROM tournaments t
            LEFT JOIN tournament_registrations r ON r.tournament_id = t.id AND r.user_id = ?
            WHERE ' . $where;
}

function find_tournament(int $id, int $userId = 0): ?array
{
    $stmt = db()->prepare(tournament_select('t.id = ?') . ' LIMIT 1');
    $stmt->execute([$userId, $id]);
    $row = $stmt->fetch();
    return $row ? shape_tournament($row) : null;
}

function valid_date(string $value): bool
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)) {
        return false;
    }
    return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
}

/** Validates the admin-editable fields; calls json_error() on problems. */
function validate_tournament(array $f, int $alreadyRegistered): array
{
    if ($f['name'] === '' || $f['sport'] === '' || $f['start_date'] === '' || $f['end_date'] === '') {
        json_error('Name, sport, start date and end date are required.', 400);
    }
    if (text_length($f['name']) > 160 || text_length($f['sport']) > 80
        || text_length($f['venue']) > 160 || text_length($f['format']) > 80) {
        json_error('One of the text fields is too long.', 400);
    }
    if (!valid_date($f['start_date']) || !valid_date($f['end_date'])) {
        json_error('Dates must use the YYYY-MM-DD format.', 400);
    }
    if ($f['end_date'] < $f['start_date']) {
        json_error('End date cannot be earlier than start date.', 400);
    }
    if ($f['max_teams'] === null || $f['max_teams'] < 1) {
        json_error('Max teams must be at least 1.', 400);
    }
    if ($f['max_teams'] < $alreadyRegistered) {
        json_error("Max teams cannot be lower than the {$alreadyRegistered} team(s) already registered.", 400);
    }
    if (!in_array($f['status'], TOURNAMENT_STATUSES, true)) {
        json_error('Invalid status value.', 400);
    }
    if ($f['venue'] === '')  { $f['venue']  = 'Main Ground'; }
    if ($f['format'] === '') { $f['format'] = 'Knockout'; }
    return $f;
}

/* ------------------------------------------------------- student actions */

function register_for_tournament(array $user, array $body): never
{
    $tid = to_id($body['tournament_id'] ?? null);
    if ($tid === null) {
        json_error('A valid tournament_id is required.', 400);
    }
    $team = clean_text($body['team_name'] ?? '');
    if ($team === '') {
        $team = (string) $user['name'];
    }
    if (text_length($team) > 120) {
        json_error('Team name must be 120 characters or fewer.', 400);
    }

    $pdo  = db();
    $fail = function (string $message, int $code) use ($pdo): never {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_error($message, $code);
    };

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT id, status, max_teams, registered_teams FROM tournaments WHERE id = ? FOR UPDATE');
        $stmt->execute([$tid]);
        $t = $stmt->fetch();

        if (!$t) {
            $fail('Tournament not found.', 404);
        }
        if ($t['status'] !== 'registration_open') {
            $fail('Registration is not open for this tournament.', 409);
        }
        if ((int) $t['registered_teams'] >= (int) $t['max_teams']) {
            $fail('This tournament is full.', 409);
        }

        $stmt = $pdo->prepare('SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$tid, $user['id']]);
        if ($stmt->fetch()) {
            $fail('You are already registered for this tournament.', 409);
        }

        $stmt = $pdo->prepare('SELECT id FROM tournament_registrations WHERE tournament_id = ? AND team_name = ? LIMIT 1');
        $stmt->execute([$tid, $team]);
        if ($stmt->fetch()) {
            $fail('That team name is already taken in this tournament.', 409);
        }

        $pdo->prepare('INSERT INTO tournament_registrations (tournament_id, user_id, team_name) VALUES (?, ?, ?)')
            ->execute([$tid, $user['id'], $team]);
        $pdo->prepare('UPDATE tournaments SET registered_teams = registered_teams + 1 WHERE id = ?')
            ->execute([$tid]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    json_response([
        'success' => true,
        'message' => 'Registered successfully.',
        'data'    => find_tournament($tid, (int) $user['id']),
    ], 201);
}

function withdraw_from_tournament(array $user, int $tid): never
{
    $pdo  = db();
    $fail = function (string $message, int $code) use ($pdo): never {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_error($message, $code);
    };

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT status FROM tournaments WHERE id = ? FOR UPDATE');
        $stmt->execute([$tid]);
        $t = $stmt->fetch();

        if (!$t) {
            $fail('Tournament not found.', 404);
        }
        if (!in_array($t['status'], WITHDRAWABLE_STATUSES, true)) {
            $fail('You can no longer withdraw from this tournament.', 409);
        }

        $stmt = $pdo->prepare('DELETE FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?');
        $stmt->execute([$tid, $user['id']]);
        if ($stmt->rowCount() === 0) {
            $fail('You are not registered for this tournament.', 404);
        }

        $pdo->prepare('UPDATE tournaments SET registered_teams = GREATEST(registered_teams - 1, 0) WHERE id = ?')
            ->execute([$tid]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    json_response(['success' => true, 'message' => 'Registration withdrawn.']);
}

/* ------------------------------------------------------------------ router */

ensure_tournament_tables();

$method = request_method();
$user   = require_login();
$body   = in_array($method, ['POST', 'PUT', 'DELETE'], true) ? read_json_body() : [];

if ($method === 'GET') {
    $id = to_id($_GET['id'] ?? null);

    if ($id !== null && !empty($_GET['registrations'])) {
        require_admin();
        $stmt = db()->prepare(
            'SELECT r.id, r.team_name, r.registered_at, u.name AS student_name, u.student_id
             FROM tournament_registrations r
             JOIN users u ON u.id = r.user_id
             WHERE r.tournament_id = ?
             ORDER BY r.registered_at ASC, r.id ASC'
        );
        $stmt->execute([$id]);
        json_response(['success' => true, 'data' => $stmt->fetchAll()]);
    }

    if ($id !== null) {
        $row = find_tournament($id, (int) $user['id']);
        if (!$row) {
            json_error('Tournament not found.', 404);
        }
        json_response(['success' => true, 'data' => $row]);
    }

    $status = strtolower(clean_text($_GET['status'] ?? ''));
    $sport  = clean_text($_GET['sport'] ?? '');
    $where  = '1 = 1';
    $params = [(int) $user['id']];

    if ($status !== '' && $status !== 'all') {
        if (!in_array($status, TOURNAMENT_STATUSES, true)) {
            json_error('Invalid tournament status.', 400);
        }
        $where   .= ' AND t.status = ?';
        $params[] = $status;
    }
    if ($sport !== '' && strtolower($sport) !== 'all') {
        $where   .= ' AND LOWER(t.sport) = LOWER(?)';
        $params[] = $sport;
    }

    $stmt = db()->prepare(tournament_select($where) . ' ORDER BY t.start_date ASC, t.id DESC');
    $stmt->execute($params);
    json_response(['success' => true, 'data' => array_map('shape_tournament', $stmt->fetchAll())]);
}

if ($method === 'POST') {
    // A body containing tournament_id is a student registration; anything else is an admin "create".
    if (array_key_exists('tournament_id', $body)) {
        register_for_tournament($user, $body);
    }

    $admin = require_admin();
    $startDate = clean_text($body['start_date'] ?? '');

    $f = validate_tournament([
        'name'        => clean_text($body['name'] ?? ''),
        'sport'       => clean_text($body['sport'] ?? ''),
        'start_date'  => $startDate,
        'end_date'    => clean_text($body['end_date'] ?? $startDate),
        'venue'       => clean_text($body['venue'] ?? 'Main Ground'),
        'format'      => clean_text($body['format'] ?? 'Knockout'),
        'max_teams'   => to_count($body['max_teams'] ?? 16),
        'status'      => strtolower(clean_text($body['status'] ?? 'registration_open')),
        'description' => clean_text($body['description'] ?? ''),
    ], 0);

    $stmt = db()->prepare(
        'INSERT INTO tournaments (name, sport, start_date, end_date, venue, format, max_teams, registered_teams, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
    );
    $stmt->execute([
        $f['name'], $f['sport'], $f['start_date'], $f['end_date'], $f['venue'],
        $f['format'], $f['max_teams'], $f['status'], $f['description'],
    ]);

    json_response([
        'success' => true,
        'message' => 'Tournament created.',
        'data'    => find_tournament((int) db()->lastInsertId(), (int) $admin['id']),
    ], 201);
}

if ($method === 'PUT') {
    $admin = require_admin();
    $id = to_id($body['id'] ?? $_GET['id'] ?? null);
    if ($id === null) {
        json_error('A valid tournament id is required.', 400);
    }
    $existing = find_tournament($id, (int) $admin['id']);
    if (!$existing) {
        json_error('Tournament not found.', 404);
    }

    $pick = static fn (string $key) => array_key_exists($key, $body) ? clean_text($body[$key]) : (string) $existing[$key];

    $f = validate_tournament([
        'name'        => $pick('name'),
        'sport'       => $pick('sport'),
        'start_date'  => $pick('start_date'),
        'end_date'    => $pick('end_date'),
        'venue'       => $pick('venue'),
        'format'      => $pick('format'),
        'max_teams'   => array_key_exists('max_teams', $body) ? to_count($body['max_teams']) : $existing['max_teams'],
        'status'      => strtolower($pick('status')),
        'description' => $pick('description'),
    ], $existing['registered_teams']);

    $stmt = db()->prepare(
        'UPDATE tournaments
         SET name = ?, sport = ?, start_date = ?, end_date = ?, venue = ?, format = ?,
             max_teams = ?, status = ?, description = ?
         WHERE id = ?'
    );
    $stmt->execute([
        $f['name'], $f['sport'], $f['start_date'], $f['end_date'], $f['venue'],
        $f['format'], $f['max_teams'], $f['status'], $f['description'], $id,
    ]);

    json_response([
        'success' => true,
        'message' => 'Tournament updated.',
        'data'    => find_tournament($id, (int) $admin['id']),
    ]);
}

if ($method === 'DELETE') {
    // ?tournament_id=N  -> a student withdrawing their own registration
    $withdrawId = to_id($_GET['tournament_id'] ?? null);
    if ($withdrawId !== null) {
        withdraw_from_tournament($user, $withdrawId);
    }

    // otherwise an admin deleting the whole tournament (registrations + results cascade)
    require_admin();
    $id = to_id($body['id'] ?? $_GET['id'] ?? null);
    if ($id === null) {
        json_error('A valid tournament id is required.', 400);
    }
    $stmt = db()->prepare('DELETE FROM tournaments WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) {
        json_error('Tournament not found.', 404);
    }
    json_response(['success' => true, 'message' => 'Tournament deleted.', 'deleted_id' => $id]);
}

method_not_allowed(['GET', 'POST', 'PUT', 'DELETE']);

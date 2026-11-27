<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/tournament_tables.php';

/** Win = 3 pts, draw = 1 pt, loss = 0. Sorted by points, goal difference, goals scored, name. */
function build_standings(array $matches): array
{
    $table = [];
    foreach ($matches as $m) {
        $sides = [
            [(string) $m['team_a'], (int) $m['score_a'], (int) $m['score_b']],
            [(string) $m['team_b'], (int) $m['score_b'], (int) $m['score_a']],
        ];
        foreach ($sides as [$team, $for, $against]) {
            $key = mb_strtolower(trim($team), 'UTF-8');
            if (!isset($table[$key])) {
                $table[$key] = [
                    'team' => $team, 'played' => 0, 'won' => 0, 'drawn' => 0, 'lost' => 0,
                    'gf' => 0, 'ga' => 0, 'gd' => 0, 'points' => 0,
                ];
            }
            $table[$key]['played']++;
            $table[$key]['gf'] += $for;
            $table[$key]['ga'] += $against;
            if ($for > $against) {
                $table[$key]['won']++;
                $table[$key]['points'] += 3;
            } elseif ($for === $against) {
                $table[$key]['drawn']++;
                $table[$key]['points'] += 1;
            } else {
                $table[$key]['lost']++;
            }
            $table[$key]['gd'] = $table[$key]['gf'] - $table[$key]['ga'];
        }
    }

    $rows = array_values($table);
    usort($rows, static function (array $a, array $b): int {
        return [$b['points'], $b['gd'], $b['gf']] <=> [$a['points'], $a['gd'], $a['gf']]
            ?: strcasecmp($a['team'], $b['team']);
    });
    return $rows;
}

ensure_tournament_tables();

$method = request_method();
$user   = require_login();
$body   = in_array($method, ['POST', 'PUT', 'DELETE'], true) ? read_json_body() : [];

if ($method === 'GET') {
    $tid   = to_id($_GET['tournament_id'] ?? null);
    $sport = clean_text($_GET['sport'] ?? '');

    $where  = '1 = 1';
    $params = [];
    if ($tid !== null) {
        $where   .= ' AND m.tournament_id = ?';
        $params[] = $tid;
    }
    if ($sport !== '' && strtolower($sport) !== 'all') {
        $where   .= ' AND LOWER(t.sport) = LOWER(?)';
        $params[] = $sport;
    }

    $stmt = db()->prepare(
        "SELECT m.id, m.tournament_id, t.name AS tournament_name, t.sport, m.round_label,
                m.team_a, m.team_b, m.score_a, m.score_b, m.played_on
         FROM match_results m
         JOIN tournaments t ON t.id = m.tournament_id
         WHERE {$where}
         ORDER BY m.played_on DESC, m.id DESC
         LIMIT 1000"
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$r) {
        $r['id']            = (int) $r['id'];
        $r['tournament_id'] = (int) $r['tournament_id'];
        $r['score_a']       = (int) $r['score_a'];
        $r['score_b']       = (int) $r['score_b'];
    }
    unset($r);

    json_response([
        'success' => true,
        'data'    => [
            'results'   => $rows,
            'standings' => $tid !== null ? build_standings($rows) : [],
        ],
    ]);
}

if ($method === 'POST') {
    $admin = require_admin();

    $tid    = to_id($body['tournament_id'] ?? null);
    $round  = clean_text($body['round_label'] ?? '');
    $teamA  = clean_text($body['team_a'] ?? '');
    $teamB  = clean_text($body['team_b'] ?? '');
    $scoreA = to_count($body['score_a'] ?? null);
    $scoreB = to_count($body['score_b'] ?? null);
    $date   = clean_text($body['played_on'] ?? '');

    if ($tid === null) {
        json_error('Please choose a tournament.', 400);
    }
    $stmt = db()->prepare('SELECT id FROM tournaments WHERE id = ? LIMIT 1');
    $stmt->execute([$tid]);
    if (!$stmt->fetch()) {
        json_error('Tournament not found.', 404);
    }
    if ($teamA === '' || $teamB === '') {
        json_error('Both team names are required.', 400);
    }
    if (mb_strtolower($teamA, 'UTF-8') === mb_strtolower($teamB, 'UTF-8')) {
        json_error('A team cannot play against itself.', 400);
    }
    if (text_length($teamA) > 120 || text_length($teamB) > 120 || text_length($round) > 60) {
        json_error('Team names must be 120 characters or fewer and the round 60 or fewer.', 400);
    }
    if ($scoreA === null || $scoreB === null) {
        json_error('Scores must be whole numbers (0 or more).', 400);
    }
    $d = DateTime::createFromFormat('Y-m-d', $date);
    if (!$d || $d->format('Y-m-d') !== $date) {
        json_error('Match date must use the YYYY-MM-DD format.', 400);
    }

    db()->prepare(
        'INSERT INTO match_results (tournament_id, round_label, team_a, team_b, score_a, score_b, played_on, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$tid, $round, $teamA, $teamB, $scoreA, $scoreB, $date, $admin['id']]);

    json_response([
        'success' => true,
        'message' => 'Result recorded.',
        'id'      => (int) db()->lastInsertId(),
    ], 201);
}

if ($method === 'DELETE') {
    require_admin();
    $id = to_id($body['id'] ?? $_GET['id'] ?? null);
    if ($id === null) {
        json_error('A valid result id is required.', 400);
    }
    $stmt = db()->prepare('DELETE FROM match_results WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) {
        json_error('Result not found.', 404);
    }
    json_response(['success' => true, 'message' => 'Result deleted.']);
}

method_not_allowed(['GET', 'POST', 'DELETE']);

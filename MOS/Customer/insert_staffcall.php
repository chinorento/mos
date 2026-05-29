<?php

$host = 'localhost';
$dbname = 'mos';
$username = 'null';
$password = 'null';

header('Content-Type: application/json; charset=utf-8');

function request_value(string $key, $default = null) {
    if (isset($_POST[$key])) {
        return $_POST[$key];
    }

    $raw = file_get_contents('php://input');
    if ($raw !== false && $raw !== '') {
        $json = json_decode($raw, true);
        if (is_array($json) && array_key_exists($key, $json)) {
            return $json[$key];
        }
    }

    return $default;
}

function normalize_datetime($value) {
    if ($value === null || $value === '') {
        return date('Y-m-d H:i:s');
    }

    try {
        $date = new DateTime((string) $value);
        return $date->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        return date('Y-m-d H:i:s');
    }
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $id = (string) (request_value('id', '') ?: ('call_' . date('YmdHis') . '_' . bin2hex(random_bytes(3))));
    $seatNo = trim((string) request_value('seat_no', request_value('seatId', '')));
    $datetime = normalize_datetime(request_value('datetime', request_value('createdAt', null)));
    $completeFlag = (int) request_value('complete_flag', request_value('完了フラグ', 0));

    if ($seatNo === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '席番が未指定です'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $pdo->prepare("INSERT INTO `staffcall_list` (`id`, `席番`, `日時`, `完了フラグ`) VALUES (:id, :seat_no, :datetime, :complete_flag)");
    $stmt->execute([
        ':id' => $id,
        ':seat_no' => $seatNo,
        ':datetime' => $datetime,
        ':complete_flag' => $completeFlag,
    ]);

    echo json_encode([
        'success' => true,
        'message' => 'スタッフ呼び出しを保存しました',
        'id' => $id,
        'seatId' => $seatNo,
        'datetime' => $datetime,
    ], JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'データベース接続エラー: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

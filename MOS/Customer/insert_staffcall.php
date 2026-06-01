<?php

  // データベース接続情報
    $host = 'localhost';
    $dbname = 'mos';
    $username = 'Customer';
    $password = 'Cust@999-00';

try {
    // 生のリクエストボディを一度だけ読み取り、JSON としてデコードしておく
    $rawBody = file_get_contents('php://input');
    $rawJson = [];
    if ($rawBody !== false && $rawBody !== '') {
        $decoded = json_decode($rawBody, true);
        if (is_array($decoded)) $rawJson = $decoded;
    }

    // POST または raw JSON ボディから値を取得する（関数は使わずインラインで処理）
    $id = '';
    if (isset($_POST['id'])) {
        $id = (string) $_POST['id'];
    } elseif (isset($rawJson['id'])) {
        $id = (string) $rawJson['id'];
    } else {
        $id = 'call_' . date('YmdHis') . '_' . bin2hex(random_bytes(3));
    }

    $seatNo = '';
    if (isset($_POST['seat_no'])) {
        $seatNo = trim((string) $_POST['seat_no']);
    } elseif (isset($rawJson['seat_no'])) {
        $seatNo = trim((string) $rawJson['seat_no']);
    } elseif (isset($rawJson['seatId'])) {
        $seatNo = trim((string) $rawJson['seatId']);
    } else {
        $seatNo = '';
    }

    // 日時の正規化は行わず、常にサーバー時刻（日本）を使用する
    // サーバー時刻（日本）
    $now = new DateTime('now', new DateTimeZone('Asia/Tokyo'));
    $datetime = $now->format('Y-m-d H:i:s');

    // 完了フラグの取得（POST優先、次にJSON、既定値0）
    if (isset($_POST['complete_flag'])) {
        $completeFlag = (int) $_POST['complete_flag'];
    } elseif (isset($rawJson['complete_flag'])) {
        $completeFlag = (int) $rawJson['complete_flag'];
    } elseif (isset($rawJson['完了フラグ'])) {
        $completeFlag = (int) $rawJson['完了フラグ'];
    } else {
        $completeFlag = 0;
    }

    // DB 接続
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 必須チェック
    if ($seatNo === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '席番が未指定です'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // INSERT 実行：テーブルの id は AUTO_INCREMENT（int）なのでクライアント生成の文字列idは挿入しない
    $stmt = $pdo->prepare("INSERT INTO `staffcall_list` (`席番`, `日時`, `完了フラグ`) VALUES (:seat_no, :datetime, :complete_flag)");
    $stmt->execute([
        ':seat_no' => $seatNo,
        ':datetime' => $datetime,
        ':complete_flag' => $completeFlag,
    ]);

    // 挿入された自動採番IDを取得
    $insertedId = $pdo->lastInsertId();

    echo json_encode([
        'success' => true,
        'message' => 'スタッフ呼び出しを保存しました',
        'id' => $insertedId,
        'external_id' => $id, // クライアント向けに生成した外部IDを付与しておく
        'seatId' => $seatNo,
        'datetime' => $datetime,
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'データベース接続エラー: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

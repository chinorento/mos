<?php

  // データベース接続情報
    $host = 'localhost';
    $dbname = 'mos';
    $username = 'Customer';
    $password = 'Cust@999-00';

header('Content-Type: application/json; charset=utf-8');

try {
    // データベース接続
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $seatNo = $_GET['seat_no'] ?? $_GET['seat'] ?? '';

    // クエリ実行
    $sql = "SELECT `id`, `席番`, `日時`, `注文内容`, `個数`, `金額`, `配膳フラグ`, `削除フラグ` 
            FROM `order_history` WHERE `削除フラグ` = 0";
    if ($seatNo !== '') {
        $sql .= " AND REPLACE(REPLACE(UPPER(TRIM(`席番`)), ' ', ''), '-', '') = REPLACE(REPLACE(UPPER(TRIM(:seat_no)), ' ', ''), '-', '')";
    }

    $stmt = $pdo->prepare($sql);
    if ($seatNo !== '') {
        $stmt->bindValue(':seat_no', $seatNo);
    }
    $stmt->execute();

    // 結果を取得
    $orderHistory = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // JSON形式で出力
    echo json_encode($orderHistory, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (PDOException $e) {
    // エラー時のレスポンス
    http_response_code(500);
    echo json_encode(['error' => 'データベース接続エラー: ' . $e->getMessage()]);
}

?>
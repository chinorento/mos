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

    // 配膳済みの個数と金額を取得
    $sql = "SELECT COALESCE(SUM(`個数`), 0) AS total_count, COALESCE(SUM(`金額`), 0) AS total_amount FROM `order_history` WHERE `配膳フラグ` = 1 AND `削除フラグ` = 0";
    if ($seatNo !== '') {
        $sql .= " AND `席番` = :seat_no";
    }

    $stmt = $pdo->prepare($sql);
    if ($seatNo !== '') {
        $stmt->bindValue(':seat_no', $seatNo);
    }
    $stmt->execute();
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    // 合計値を JSON で返す
    echo json_encode([
        'totalCount' => (int) $result['total_count'],
        'totalAmount' => (float) $result['total_amount']
    ]);
} catch (PDOException $e) {
    // エラー時のレスポンス
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}

?>
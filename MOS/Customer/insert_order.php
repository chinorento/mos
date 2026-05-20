<?php
// タイムゾーンを日本に設定
// date_default_timezone_set('Asia/Tokyo');

// データベース接続情報
$host = 'localhost';
$dbname = 'mos';
$username = 'null';
$password = 'null';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // POSTデータを取得（新旧キーを受け付け）
    $id = $_POST['id'] ?? ('order_' . time());
    $seatNo = $_POST['seat_no'] ?? ($_POST['name'] ?? 'unknown');
    $orderContent = $_POST['order_content'] ?? ($_POST['data'] ?? '');
    $amount = isset($_POST['amount']) ? (int)$_POST['amount'] : 0;
    $servedFlag = isset($_POST['served_flag']) ? (int)$_POST['served_flag'] : 0;
    $deletedFlag = isset($_POST['deleted_flag']) ? (int)$_POST['deleted_flag'] : 0;

    // クライアント時刻ではなく、日本時間のサーバー時刻を採用
    $now = new DateTime('now', new DateTimeZone('Asia/Tokyo'));
    $datetime = $now->format('Y-m-d H:i:s');

    // SQLクエリを準備（テーブル構成に合わせる）
    $stmt = $pdo->prepare("INSERT INTO `order_history`(`id`, `席番`, `日時`, `注文内容`, `金額`, `配膳フラグ`, `削除フラグ`) 
                            VALUES (:id, :seat_no, :datetime, :order_content, :amount, :served_flag, :deleted_flag)");
    $stmt->bindParam(':id', $id);
    $stmt->bindParam(':seat_no', $seatNo);
    $stmt->bindParam(':datetime', $datetime);
    $stmt->bindParam(':order_content', $orderContent);
    $stmt->bindParam(':amount', $amount, PDO::PARAM_INT);
    $stmt->bindParam(':served_flag', $servedFlag, PDO::PARAM_INT);
    $stmt->bindParam(':deleted_flag', $deletedFlag, PDO::PARAM_INT);

    // クエリを実行
    $stmt->execute();

    echo json_encode(['success' => true]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>
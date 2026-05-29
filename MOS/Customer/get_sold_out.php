<?php
header('Content-Type: application/json; charset=utf-8');

$host = 'localhost';
$dbname = 'mos';
$username = 'null';
$password = 'null';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 品切れフラグが立っている行の id（または商品ID）を返す
    $stmt = $pdo->query("SELECT id FROM `menu_list` WHERE `品切れフラグ` = 1");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $ids = array_map(function($r){ return (string)$r['id']; }, $rows);

    echo json_encode($ids, JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

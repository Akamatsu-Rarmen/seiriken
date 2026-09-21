const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const app = express();

const db = new sqlite3.Database("tickets.db");

// テーブル作成
db.run(`
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

// 時間帯
function getSlot() {
  const hour = new Date().getHours() + 9;

  if (hour === 10) return "1部（9:00〜10:00）";
  if (hour === 11) return "2部（10:00〜11:00）";
  if (hour === 12) return "3部（11:00〜12:00）";
  if (hour === 13) return "4部 (12:00〜13:00) ";
  if (hour === 14) return "5部 (13:00〜14:00) ";
  if (hour === 15) return "6部 (14:00〜15:00) ";
  
  return "時間外";
}

// API
app.get("/get-ticket", (req, res) => {
  const now = new Date();
  const hour = now.getHours();

  db.get(
    `SELECT COUNT(*) as count FROM tickets 
     WHERE strftime('%H', created_at) = '${hour.toString().padStart(2, '0')}'`,
    (err, row) => {

      // 15人制限
      if (row.count >= 15) {
        return res.json({
          success: false,
          message: "この部は満員です"
        });
      }

      db.run("INSERT INTO tickets DEFAULT VALUES", function(err) {
        res.json({
          success: true,
          number: row.count + 1, // ←ここがポイント
          slot: getSlot()
        });
      });
    }
  );
});

// 画面
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body {
  margin:0;
  overflow:hidden;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
  background: radial-gradient(circle at bottom, #0d1b2a, #000);
  font-family:sans-serif;
  color:white;
}

/* 流れ星用 */
.shooting-star {
  position:absolute;
  top:0;
  left:50%;
  width:2px;
  height:80px;
  background: linear-gradient(white, transparent);
  opacity:0;
  transform: rotate(45deg);
  animation: shoot 2s linear infinite;
}

@keyframes shoot {
  0% {
    transform: translate(0,0) rotate(45deg);
    opacity:1;
  }
  100% {
    transform: translate(-600px,600px) rotate(45deg);
    opacity:0;
  }
}

/* カード */
.ticket {
  position:relative;
  z-index:10;
  background: rgba(255,255,255,0.95);
  color:#222;
  padding:40px;
  border-radius:25px;
  text-align:center;
  box-shadow:0 20px 60px rgba(0,0,0,0.5);
  width:300px;
}

.slot {
  font-size:18px;
  margin-bottom:10px;
  color:#666;
}

.number {
  font-size:100px;
  font-weight:bold;
}

.label {
  font-size:14px;
  color:#888;
}
</style>
</head>

<body>
<div class="shooting-star" style="left:20%; animation-delay:0s;"></div>
<div class="shooting-star" style="left:50%; animation-delay:1s;"></div>
<div class="shooting-star" style="left:80%; animation-delay:2s;"></div>
<div class="ticket">
  <div id="slot"></div>
  <div id="number">...</div>
  <div>整理券番号</div>
</div>

<script>
async function getTicket() {
  const res = await fetch('/get-ticket');
  const data = await res.json();

  if (!data.success) {
    document.getElementById("number").innerText = "×";
    document.getElementById("slot").innerText = data.message;
  } else {
    document.getElementById("number").innerText = data.number;
    document.getElementById("slot").innerText = data.slot;
  }
}

// 開いた瞬間に発行
getTicket();
</script>

</body>
</html>
`);
});

app.listen(3000, () => console.log("started"));

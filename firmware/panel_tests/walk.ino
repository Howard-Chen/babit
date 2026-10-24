// 燈序測試 1：單燈逐顆跑（取代舊的 student.h TEST_MODE 1）
// 第一次點亮新燈板用：藍點照實體燈號一顆一顆走，序列埠同時印出燈號
// （arduino-cli monitor -p COM埠號 -c baudrate=115200）。
// 記下：第 0 顆在哪個角？第二排是跳回同側（逐行）還是折返（蛇行）？
// 這個測試要看實體燈序，所以排列旗標都設成 0（寫在 #include 前面會蓋掉函式庫的設定）。
#define PANEL 16             // 測幾乘幾的燈板就寫幾
#define BP_ROTATE 0
#define BP_SERPENTINE 0
#define BP_TRANSPOSE 0
#include "BatoPixel.h"

void setup() {
  begin();
}

void loop() {
  int i = (int)(seconds() * 8) % (WIDTH * HEIGHT);   // 每秒前進 8 顆
  clear();
  dot(i % WIDTH, i / WIDTH, BLUE);
  static int last = -1;
  if (i != last) { Serial.println(i); last = i; }
  show();
}

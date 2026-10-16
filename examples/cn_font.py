# 中文 16×16 點陣字型表產生器：py examples/cn_font.py "你好！我是巴比特燈板"
#
# 字型：思源黑體（Noto Sans TC，SIL OFL 授權、可商用）16px、字重 400、關掉反鋸齒——
# LED 一顆只有亮或暗，開反鋸齒會糊成灰階；比較過 400／500／700 與 15／16px，400＋16px 筆畫最清楚，
# 字重再粗的話「燈」「電」這類筆畫多的字會糊成一塊。
# 輸出 C 的字型表：句子裡用到的字各一筆（重複的字只收一次），每個字 16 排、每排一個 16 位元的數，
# 最左邊一格是最高位（0x8000），1＝亮。整段貼進範例的 FONT[] 取代原本的內容。
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "C:/Windows/Fonts/NotoSansTC-VF.ttf"
WEIGHT = 400
REF = "國電體灣！"   # 用這組最高、最低的字定共用基線：換句子時每個字的高低位置才一致


def main():
    if len(sys.argv) < 2:
        sys.exit('用法：py examples/cn_font.py "要顯示的句子"')
    chars = list(dict.fromkeys(ch for ch in sys.argv[1] if not ch.isspace()))
    try:
        font = ImageFont.truetype(FONT_PATH, 16)
    except OSError:
        sys.exit("找不到 " + FONT_PATH + "（Noto Sans TC），請先安裝這個字型")
    font.set_variation_by_axes([WEIGHT])

    boxes = [font.getbbox(ch, anchor="ls") for ch in REF]
    top, bot = min(b[1] for b in boxes), max(b[3] for b in boxes)
    base = round((16 - (bot - top)) / 2 - top)          # 基線放在第幾排，參考字的墨跡剛好上下置中

    out = ["const Glyph FONT[] = {"]
    for ch in chars:
        b = font.getbbox(ch, anchor="ls")
        if b[1] + base < 0 or b[3] + base > 16:
            print("注意：「" + ch + "」超出 16 排，上下會被切掉", file=sys.stderr)
        im = Image.new("1", (16, 16), 0)
        d = ImageDraw.Draw(im)
        d.fontmode = "1"                                 # 關掉反鋸齒
        x = round((16 - (b[2] - b[0])) / 2 - b[0])       # 墨跡水平置中
        d.text((x, base), ch, font=font, fill=1, anchor="ls")
        px = im.load()
        rows = ["0x%04X" % sum(1 << (15 - xx) for xx in range(16) if px[xx, yy]) for yy in range(16)]
        out.append('  {"' + ch + '", {' + ", ".join(rows[:8]) + ",")
        out.append("          " + ", ".join(rows[8:]) + "}},")
    out.append("};")
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(out))


if __name__ == "__main__":
    main()

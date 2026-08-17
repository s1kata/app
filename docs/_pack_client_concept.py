# -*- coding: utf-8 -*-
"""Собрать папку концепта для заказчика: русские имена, без 2026, текущий логотип."""
from pathlib import Path
from PIL import Image

SRC = Path(r"D:\mobile-app\app\docs\ui-concept-2026")
ASSETS = Path(r"C:\Users\Ильяс\.cursor\projects\d-travelhub-v2\assets")
DEST = Path(r"D:\mobile-app\app\docs\TravelHub-концепт-для-заказчика")
SCREENS = DEST / "экраны"
LOGO = Path(r"D:\mobile-app\app\assets\icons\icon-vip-1024.png")

MAPPING = [
    ("concept-full-01-splash.png", "01-заставка.png", "splash"),
    ("concept-full-02-login.png", "02-вход.png", "login"),
    ("concept-full-03-register.png", "03-регистрация.png", "login"),
    ("concept-full-04-forgot.png", "04-восстановление-пароля.png", None),
    ("concept-full-05-reset.png", "05-новый-пароль.png", None),
    ("concept-full-06-home.png", "06-главная.png", "home"),
    ("concept-full-07-hot-tours.png", "07-горящие-туры.png", None),
    ("concept-full-08-tour-search.png", "08-поиск-тура.png", None),
    ("concept-full-09-tour-results.png", "09-результаты-туров.png", None),
    ("concept-full-10-tour-details.png", "10-карточка-тура.png", None),
    ("concept-full-11-tour-booking.png", "11-бронирование-тура.png", None),
    ("concept-full-12-hotel-search.png", "12-поиск-отелей.png", None),
    ("concept-full-13-popular-hotels.png", "13-популярные-отели.png", None),
    ("concept-full-14-hotel-details.png", "14-карточка-отеля.png", None),
    ("concept-full-15-hotel-booking.png", "15-заявка-по-отелю.png", None),
    ("concept-full-16-countries.png", "16-страны.png", None),
    ("concept-full-17-country-detail.png", "17-страница-страны.png", None),
    ("concept-full-18-country-info.png", "18-инфо-о-стране.png", None),
    ("concept-full-19-favorites.png", "19-избранное.png", None),
    ("concept-full-20-bookings.png", "20-мои-заявки.png", None),
    ("concept-full-21-profile.png", "21-профиль.png", "home"),
    ("concept-full-22-settings.png", "22-настройки.png", None),
    ("concept-full-23-personal-data.png", "23-личные-данные.png", None),
    ("concept-full-24-bonus.png", "24-бонусы.png", None),
    ("concept-full-25-purchase-history.png", "25-история-покупок.png", None),
    ("concept-full-26-helper-chat.png", "26-чат-помощник.png", None),
    ("concept-full-27-about.png", "27-о-компании.png", "about"),
    ("concept-full-28-reviews.png", "28-отзывы.png", None),
    ("concept-full-29-legal.png", "29-документы.png", None),
    ("concept-full-30-success.png", "30-заявка-отправлена.png", None),
]


def find_src(name: str) -> Path | None:
    for base in (SRC, ASSETS):
        p = base / name
        if p.exists():
            return p
    return None


def rounded_logo(size: int) -> Image.Image:
    logo = Image.open(LOGO).convert("RGBA")
    logo = logo.resize((size, size), Image.Resampling.LANCZOS)
    # already rounded in asset; keep as is
    return logo


def paste_center(base: Image.Image, logo: Image.Image, cy_ratio: float) -> Image.Image:
    out = base.convert("RGBA")
    x = (out.width - logo.width) // 2
    y = int(out.height * cy_ratio) - logo.height // 2
    out.alpha_composite(logo, (x, y))
    return out


def paste_top_left(base: Image.Image, logo: Image.Image, pad: int = 48) -> Image.Image:
    out = base.convert("RGBA")
    # cover status-bar area left
    y = int(out.height * 0.07)
    out.alpha_composite(logo, (pad, y))
    return out


def apply_logo(img: Image.Image, mode: str | None) -> Image.Image:
    if not mode:
        return img
    w = img.width
    if mode == "splash":
        return paste_center(img, rounded_logo(int(w * 0.28)), 0.38)
    if mode == "login":
        return paste_center(img, rounded_logo(int(w * 0.18)), 0.14)
    if mode == "home":
        return paste_top_left(img, rounded_logo(int(w * 0.09)), pad=int(w * 0.05))
    if mode == "about":
        return paste_center(img, rounded_logo(int(w * 0.16)), 0.22)
    return img


def main():
    SCREENS.mkdir(parents=True, exist_ok=True)
    logo_dest = DEST / "логотип-TravelHub.png"
    logo_dest.write_bytes(LOGO.read_bytes())

    done = 0
    for src_name, dest_name, mode in MAPPING:
        src = find_src(src_name)
        if not src:
            print("MISSING", src_name)
            continue
        img = Image.open(src)
        img = apply_logo(img, mode)
        out_path = SCREENS / dest_name
        img.convert("RGB").save(out_path, "PNG", optimize=True)
        done += 1
        print("ok", dest_name)

    readme = DEST / "Читать.txt"
    readme.write_text(
        """TravelHub — концепт интерфейса приложения
Для согласования с заказчиком

Что внутри
- папка «экраны» — все основные экраны приложения в новом визуальном стиле
- файл «логотип-TravelHub.png» — текущий логотип приложения

Стиль
- спокойные цвета TravelHub
- крупные фото отелей и стран
- цена сразу видна
- простой путь: выбрать → увидеть цену → оставить заявку

Список экранов
01 заставка
02 вход
03 регистрация
04 восстановление пароля
05 новый пароль
06 главная
07 горящие туры
08 поиск тура
09 результаты туров
10 карточка тура
11 бронирование тура
12 поиск отелей
13 популярные отели
14 карточка отеля
15 заявка по отелю
16 страны
17 страница страны
18 инфо о стране
19 избранное
20 мои заявки
21 профиль
22 настройки
23 личные данные
24 бонусы
25 история покупок
26 чат-помощник
27 о компании
28 отзывы
29 документы
30 заявка отправлена

Если концепт нравится — можно переносить этот вид в рабочее приложение.
""",
        encoding="utf-8",
    )
    print("DONE", done, "->", DEST)


if __name__ == "__main__":
    main()

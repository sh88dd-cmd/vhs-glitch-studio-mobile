# Референсы района
Маросейка: https://um.mos.ru/places/ulitsa_maroseyka/
Лубянский проезд: https://um.mos.ru/places/lubyanskiy_proezd/
Угловая усадьба: https://um.mos.ru/houses/dom_v_p_razumovskoy/
Солянка: https://www.ruphoto.ru/home/blog/273-dom-s-atlantami
Зарядье: https://welcome.zaryadyepark.ru/
Piggy, Солянка 4с4, летняя веранда: https://yandex.com/maps/org/piggi/171955302349/
Фото здания (CC0, Александр Сигачёв): https://commons.wikimedia.org/wiki/File:Moscow_-_Solyanka_4s4_-_2025-09_-_p1.jpg
Интерьер с открытым кирпичом, картой мира на стене, подвесными лампами и разноцветными стульями: https://findquiz.ru/location/piggi-kitaj-gorod
Адресная точка, не точный вход: https://urbanplaces.su/ru_moskva/moskva/card-745210-svoj-klyuch
Точные фасады, план и границы веранды пока не восстановлены. OSM: реальные контуры и дорожные линии, оценочные высоты и ширины.

## Архитектура 0.8
- Солянка 4с4 и 6: предоставленные пользователем фотографии панорамы; ручная геометрия и оценка высоты, без копирования панорамных пикселей. Для 4с4 также https://commons.wikimedia.org/wiki/File:Moscow_-_Solyanka_4s4_-_2025-09_-_p1.jpg
- Солянка 1/2: https://mosmarshrut.ru/solyanka — шесть этажей, неоклассицизм, коммерческий первый этаж.
- Солянка 7: https://tlp-ab.ru/main/35/?modal=1 — пластика окон, карнизы, балюстрады. Скульптуры и точные обмеры пока не выполнены.
- Маросейка 4/2: https://komisioner.ru/stati/dom-gusyatnikova-maroseyka-4/ — адрес и исторический тип. Маросейка 2/15: https://um.mos.ru/houses/dom_v_p_razumovskoy/
- Остальные здания: исходные контуры OSM, типологические приближённые фасады; не подтверждены по каждому адресу. Кровли только на выпуклых контурах без внутренних дворов. Вывески Piggy нарисованы заново.

## District architecture 0.8 / district-2
Address inventories: https://ru.wikipedia.org/wiki/Улица_Солянка ; https://ru.wikipedia.org/wiki/Маросейка ; https://ru.wikipedia.org/wiki/Лубянский_проезд . Photo references: https://commons.wikimedia.org/wiki/File:Moscow_-_Solyanka_4s4_-_2025-09_-_p1.jpg (CC0, Сигачёв); https://um.mos.ru/places/ulitsa_solyanka/ ; https://um.mos.ru/houses/dom_v_p_razumovskoy/ ; https://russian-church.ru/viewpage.php?page=2125 ; https://www.zaryadyepark.ru/en/smi/photobank/mediatsentr/ . Yandex address 4с4 centroid 55.753706,37.637219; OSM way 52404043 is the matching low-rise polygon but is tagged 4с1. See https://yandex.com/maps/213/moscow/house/ulitsa_solyanka_4s4/Z04YcARnS0QOQFtvfXt0cntjYg%3D%3D/ . Profiles are procedural approximations informed by address history and selected street photos, not all measured individually. All footprints have a low-cost façade atlas before close-range geometry. Church silhouettes are approximate. No Yandex panorama pixels redistributed.

District landscape references: https://mosinzhproekt.ru/project/park-zaryade/ ; https://zaryadyehall.ru/about/ ; https://archi.ru/projects/russia/10331/koncertnyi-zal-zaryade ; https://archi.ru/projects/russia/16512/paryaschii-most-v-parke-zaryade ; https://thecity.m24.ru/articles/13021 . Bridge centerline OSM 480821442; deck height relative to flat game terrain is approximate and not walkable yet. Concert hall exterior uses documented coordinate and approximate dimensions; park trees placed inside OSM polygons, not surveyed individual trees. Terrace layout approximated, no interior added.

Verification: captures for Solyanka, Maroseyka, Lubyansky, Zaryadye and Piggy plus JSON coverage audit. Screenshot nonblank checks are not a human comparison of every building; individual address survey still pending. Added modeled Golden Pig sign, stone portal supports and approximate eight-column portico. Reference photo: https://commons.wikimedia.org/wiki/File:Moscow_-_Solyanka_4s4_-_2025-09_-_p1.jpg .

## district-5
Fixed geographic reflection globally: baked basis determinant was positive in x/z; renderer now reflects x once for all roads, geometry, collision, navigation, and place coordinates and asserts negative determinant. Expanded geographic data request to 55.7445–55.7605 N / 37.621–37.649 E. The supplied 2026 Piggy photos show two pedimented main entrances, grey plinth, signage, third small side storefront; remodeled these and Solyanka 6. References: https://www.etovidel.net/sights/pamiatnik-kirillu-i-mefodiu/ ; https://ru.aroundus.com/p/9405064-pamiatnik-kirillu-i-mefodiiu ; https://www.komandirovka.ru/sights/moscow/pamyatnik-geroyam-plevnyi/ ; https://moskvapark.naidich.ru/iliinskver/iliinskver.htm ; https://www.megaflot.ru/showplace/vysotka-na-kotelnicheskoy-moskva/ ; https://moskultura.ru/mesta/stalinskaya-vysotka-na-kotelnicheskoj-naberezhnoj ; https://hramkulishki.ru/ . Memorials and tower are manually approximated meshes, not photogrammetry. No licensed panorama images bundled. Added actual OSM water polygons when available. Terrain remains flat, no surveyed elevation.

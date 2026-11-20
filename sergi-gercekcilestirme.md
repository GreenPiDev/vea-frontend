# Sergi Gerçekçileştirme Planı

Bu doküman, 3D sanal serginin "render gibi" değil "gerçek bir mekân gibi" görünmesi için adım adım
yapılacakları içerir. Her adım ayrı bir Claude oturumunda tek başına uygulanabilecek şekilde yazıldı.

**Kullanım:** Yeni bir oturumda şunu söylemen yeterli:
> `sergi-gercekcilestirme.md` dosyasındaki **Adım N**'i uygula.

Adımları **sırayla** uygula. Bazı adımlar bir öncekinin sonucuna göre ince ayar gerektiriyor
(özellikle 2 → 6 → 7).

---

## 0. Her oturum için ortak bağlam (önce bunu oku)

### Teşhis özeti (2026-11-19 incelemesi)
"pavyon" (kırmızı duvar, balıksırtı parke) ve "asdas" (tuğla duvar, mermer zemin) sergileri tarayıcıda
gezilerek incelendi. Doku kalitesi aslında iyi. Yapaylığın asıl kaynakları:

1. **Işığın yönü yok.** Oda büyük ölçüde `ambientLight` + `hemisphereLight` ile aydınlatılıyor. Köşede
   birleşen iki duvar aynı parlaklıkta. Tavan lambalarının altında ışık havuzu yok, duvarlarda yukarıdan
   aşağı solan aydınlık yok. Silindir kaide bile neredeyse tek tonda.
2. **Kontrast / dinamik aralık yok.** Her şey orta tonda. Tablodan uzaktaki duvar neredeyse tablo kadar
   parlak. "asdas"ta tavan ve zemin aşırı pozlanmış.
3. **Kamera çok geniş açılı, hareket çok hızlı.** `fov: 65` dikey açı, 16:9'da yataydan yaklaşık 98°.
   Yürüme hızı 3,2–3,6 m/s, yani koşu hızında.
4. **Detay sorunları:**
   - Tablo ışığı yuvarlak bir sıcak nokta gibi; çerçevede parlak bir leke var.
   - Çerçeve düz bir kutu.
   - Tuğla dokusunun tekrarı belli.
   - Mermer zeminde parlama lekeleri var.
   - Tavan AO'su serbest duvarların tepesinde kurum gibi lekeler bırakıyor.
   - Vignette fazla güçlü.

### Proje kuralları (CLAUDE.md'den, ASLA bozma)
- **Sis yok.** Kullanıcı açıkça istemiyor.
- **Duvar-tavan arası pervaz yok** (kullanıcı isteğiyle kaldırıldı). Süpürgelik 2026-11-20'de kullanıcı isteğiyle yeni bir profille geri eklendi (`baseboard.ts`), onu kaldırma.
- **Görünür armatürü olmayan directional/point light yok.** Parlak zeminler bunları kaynaksız parlama
  olarak yansıtıyor.
- **SSAO yok.** Bunun yerine `roomAo.ts` (önceden hesaplanan AO) seçildi.
- Tone mapping `EffectComposer` içinde (`ToneMappingMode.NEUTRAL`), renderer'da değil. ACES'e dönme,
  eser renklerini kaydırıyor.
- FXAA için her zaman `SeparateFXAA.tsx`, kütüphanenin `<FXAA />`'sı değil.
- Gerçek gölge haritası (`castShadow`) yok. Gölgeler hep "sahte"/önceden hesaplanmış.
- **Performans çok önemli:** masaüstünde 60 FPS korunmalı, telefonlar da hedef. Kare başına CPU maliyeti
  eklemekten ve ışık sayısını değiştirmekten (shader yeniden derlenmesi) kaçın. `ArtworkLightPool.tsx`'teki
  sabit ışık havuzu mantığını bozma.

### Test ortamı
- Backend gerekli: `vea-api` klasöründe `npm run dev`. Postgres **postgresql@14** olmalı (vea-api
  CLAUDE.md'ye bak). Redis de açık olmalı.
- Frontend: `npm run dev`. Ana sayfa → "Sergilere Göz At" → sergi seç.
- Karşılaştırma için en az **"pavyon"** ve **"asdas"** sergilerine, mümkünse statik şablonlardan birine
  (ör. "Büyük Galeri") bak.
- Her adımın sonunda: `npm run build` ve `npm test` hatasız geçmeli.
- Her adımın sonunda **CLAUDE.md'yi güncelle**: Realism layer bölümüne ne değişti, neden.
- Mümkünse Chrome ile önce/sonra ekran görüntüsü al. Aynı noktadan, aynı açıdan bak.
  Görsel kontrol yapılamadıysa bunu açıkça söyle.

---

## Adım 1 — Kamera açısı ve yürüme hızı

**Neden:** Geniş açı kenarları geriyor ve mekânı GoPro/oyun görüntüsü gibi gösteriyor. Koşu hızında
hareket de mekânı küçük ve "oyun" gibi hissettiriyor. Adımların en ucuzu ama etkisi en büyüklerinden.

**Dosyalar:** `src/components/3d/Scene.tsx` (`camera={{ fov: 65 ... }}`), `src/components/3d/Player.tsx`
(`WALK_SPEED`, `CLICK_WALK_SPEED`), gerekirse `ClickNavigation.tsx` / `clickNavigationGeometry.ts`.

**Yapılacaklar:**
1. Dikey `fov`'u 65'ten **48** civarına indir. 45 / 48 / 52 değerlerini dene, en doğal olanı seç.
   - Telefonda yatay ekran ve zorunlu yatay mod var (`useForcedLandscape.ts`). Dar en-boy oranında
     görüş çok daralıyorsa, fov'u en-boy oranına göre ayarla: **yatay** görüş ~75–80° kalacak şekilde
     dikey fov hesapla, makul bir aralıkta sınırla.
2. `WALK_SPEED` 3.6 → **~2.0**, `CLICK_WALK_SPEED` 3.2 → **~2.0** m/s. Varış yavaşlaması korunmalı.
3. Kodda fov'a bağlı başka hesap var mı ara (ikon projeksiyonu, tıklama ışını, `ArtworkIconProjector`,
   tablonun karşısına gelme mesafesi). Tablonun "tam karşısına geç" konumu yeni fov'da tabloyu ekrana
   sığdırmıyorsa, durma mesafesini fov'a göre hesapla.

**Kabul kriteri:**
- Kenarlarda gerilme yok.
- Tablonun karşısına gelince tablo ve etiketi rahatça ekrana sığıyor.
- Yürüyüş "sakin bir müze gezisi" hissi veriyor.

---

## Adım 2 — Pozlama ve kontrast (dolgu ışığını kıs, eseri öne çıkar)

**Neden:** Gerçek bir müzede en parlak şey eserdir, çevresi belirgin şekilde daha loştur. Şu an ambient
dolgu her şeyi eşit aydınlatıyor, görüntüde gerçek karanlık da gerçek parlaklık da yok.

**Dosyalar:** `GalleryLights.tsx` (`ROOM_FILL_BOOST`), `RoomEnvironment.tsx` (`ENVIRONMENT_INTENSITY`,
`CEILING_FIXTURE_INTENSITY`), `ArtworkLightPool.tsx` (`SPOT_INTENSITY_SCALE`), `exhibitions.ts` ve
`backendAdapter.ts` (tema varsayılanları: `ambientIntensity`, `spotIntensity`).

**Yapılacaklar:**
1. `ROOM_FILL_BOOST` ve `ENVIRONMENT_INTENSITY`'yi yaklaşık **%35–45** kıs.
2. `SPOT_INTENSITY_SCALE`'i, tablonun ortası çevresindeki duvardan **3–5 kat** parlak olacak şekilde artır.
   Tablo kendisi parlayıp beyaza kaçmamalı; Neutral tone mapping vurguları yumuşatıyor ama kontrol et.
3. Backend sergilerinin tema varsayılanları `backendAdapter.ts`'te. Statik şablonlar ve backend sergileri
   aynı sonucu vermeli; tek bir "kadran"dan ayarlanabiliyorsa öyle yap.
4. Açık renkli odalar ("asdas": beyaz mermer + açık tavan) aşırı pozlanmış görünüyor. Gerekirse tema
   renklerinden bağımsız bir pozlama dengesi düşün. Ama ana çözüm Adım 3 ve 6.

**Not:** Oda bu adımdan sonra fazla karanlık görünebilir. Normal: eksik ışığı Adım 6'daki yönlü tavan
ışığı tamamlayacak. Bu adımda "eser öne çıkıyor mu" sorusuna odaklan, odanın genel parlaklığı Adım 6'dan
sonra yeniden ayarlanacak.

**Kabul kriteri:** Tablolar göz alıcı derecede öne çıkıyor. Ortam loş ama okunaklı. Hiçbir yüzey düz
beyaza patlamıyor.

---

## Adım 3 — Tavan: daha koyu, daha sakin

**Neden:** "asdas"ta tavan odanın en parlak ve en baskın yüzeyi. Doku da lekeli/mermer gibi görünüyor.
Gerçek galerilerde tavan genelde en karanlık yüzeydir, göz duvara ve esere gider.

**Dosyalar:** `GalleryRoom.tsx` (`CEILING_NORMAL_SCALE = [2.5, 2.5]`, tavan malzemesi),
`RoomEnvironment.tsx` (env map'te tavan rengi çarpanı `0.7`), tavan renk/doku varsayılanları.

**Yapılacaklar:**
1. `CEILING_NORMAL_SCALE`'i **~1.0**'a indir. Lekeli görüntü kaybolmalı.
2. Tavanın aldığı dolgu ışığını duvarlardan **daha az** yap. Örnek yöntemler:
   - Tavan malzemesine ayrı bir çarpan.
   - AO patch'inde tavan yüzeyi için ek bir karartma.

   Hemisphere ışık zaten tavana "gökyüzü" rengini en güçlü veriyor, bu tavanı gereğinden parlak yapıyor
   olabilir; kontrol et.
3. Env map'teki tavan çarpanını (0.7) da düşür ki parlak zeminler tavanı çok parlak yansıtmasın.

**Kabul kriteri:** Tavan, lambaların etrafı dışında duvarlardan koyu. Doku sakin, mermer gibi değil.
Lambalar karanlık tavanda net bir ışık kaynağı olarak okunuyor.

---

## Adım 4 — Post-processing: vignette ve film greni

**Neden:** Vignette (0.55) filtre gibi hissettiriyor. CG görüntü fazla "temiz": düz renk alanlarında
hiç gürültü yok, renk geçişlerinde bantlanma olabiliyor. Gerçek kamera görüntüsünde hafif bir gren olur.

**Dosyalar:** `src/components/3d/Scene.tsx` (EffectComposer zinciri).

**Yapılacaklar:**
1. `<Vignette darkness>` 0.55 → **~0.3**, `offset` gerekirse ayarla.
2. `@react-three/postprocessing`'in `<Noise>` efektini ekle. Çok düşük opaklık (~0.03–0.06), `premultiply`
   açık, tone mapping'den **sonra**. Ayrı bir pass açmasın, mevcut EffectPass'e girsin.
   - Telefonlarda (FXAA yolu) da çalıştığını ve ek bir pass oluşturmadığını kontrol et.
3. Bloom'un çerçevelerdeki parlama lekesini büyütüp büyütmediğine bak (Adım 7 ile birlikte).

**Kabul kriteri:** Gren "fark edilmeyecek kadar" hafif, ama kapatınca görüntünün daha "plastik" olduğu
anlaşılıyor. FPS değişmiyor.

---

## Adım 5 — Tavan AO lekeleri

**Neden:** Serbest duran duvar panellerinin tavana değdiği yerlerde tavanda ~1 m'ye yayılan koyu,
kurum gibi lekeler var. Gerçekte duvar-tavan birleşimi ince ve keskin bir çizgidir.

**Dosyalar:** `roomAoMaterial.ts` (`ROOM_AO_SURFACE == 1`, tavan dalı; `WALL_CEILING_AO`), `roomAo.ts`
(alan yarıçapı/gücü).

**Yapılacaklar:**
1. Tavan şu an zeminle aynı AO alanını (`.r`) aynı güçte kullanıyor. Tavan için ayrı ve **daha dar/zayıf**
   bir yanıt uygula. Örneğin alanı yeniden eşle: `mix(1.0, field, CEILING_AO_STRENGTH)` ve kenara daha
   yakın bir eğri.
2. Duvar tarafındaki duvar-tavan bandını (`WALL_CEILING_AO`: radius 0.6, strength 0.4) da gözden geçir.
3. `roomAo.test.ts`'teki beklentiler değişirse testleri güncelle.

**Kabul kriteri:** Tavanda koyu lekeler yok. Duvar-tavan birleşimi hafif ve ince bir gölge çizgisi.

---

## Adım 6 — Tavan lambalarından yönlü ışık (EN ÖNEMLİ ADIM)

**Neden:** Yapaylığın bir numaralı sebebi bu. Tavan lambaları şu an sadece parlayan diskler, çevrelerine
ışık vermiyorlar. Oda yönsüz ambient ile aydınlanıyor. Gerçek bir mekânda olması gerekenler:
- Lambaların altında zeminde yumuşak ışık havuzları.
- Duvarlarda lambaya yakın yerlerde yukarıdan aşağı solan aydınlık ("scallop").
- Köşede birleşen iki duvarın farklı parlaklıkta olması.
- Kaide ve mobilya gibi nesnelerin bir yanının aydınlık, öbür yanının gölgede olması.

**Kısıt:** Gerçek `spotLight`/`pointLight` eklemek YASAK değil ama pahalı ve ışık sayısını değiştirir
(shader yeniden derlenir). Burada önerilen yöntem **analitik, sabit maliyetli** bir ışık: tavan lambalarının
konumları zaten biliniyor (`layout.ceilingSpots`), ve bu ışığın görünür bir kaynağı var (disk armatür).
Yani "kaynaksız ışık yok" kuralına uyuyor.

**Önerilen yaklaşım (oda yüzeyleri için):**
1. `roomAoMaterial.ts`'in `onBeforeCompile` patch'ine (zemin, duvar ve tavan zaten bunu kullanıyor) bir
   "tavan lambası ışığı" terimi ekle:
   - Uniform: lamba konumları dizisi (`vec3[MAX_CEILING_LIGHTS]`), sayı, renk, güç.
     `MAX_CEILING_LIGHTS` sabit bir `#define` olsun; döngü sabit üst sınırla dönsün ve sayının ötesini
     atlasın. Böylece oda değişince bile program yeniden derlenmez.
   - Her lamba için: aşağı bakan bir lob (`pow(max(dot(-L, down), 0), k)`, k ~ 2–4, downlight dağılımı)
     × yüzey kosinüsü (`max(dot(N, L), 0)`) × `1 / (d² + ε)`.
   - Sonuç yalnızca **diffuse** olarak eklensin:
     `reflectedLight.directDiffuse += E * BRDF_Lambert(material.diffuseColor)`.
     **Speküler ekleme.** Lambaların parlak zemindeki yansıması zaten `RoomEnvironment.tsx` env map'inden
     geliyor. Speküler eklemek çift yansıma ve kaynaksız parlama yaratır.
   - İsteğe bağlı: duvarların arkasında kalan noktalar için AO alanından basit bir görünürlük tahmini.
     Gerekmedikçe ekleme, önce sonucu gör.
2. Mobilyalar (GLTF, `FurnitureInstances.tsx` / `GalleryFurniture.tsx`) ve çerçeveler de aynı ışığı almazsa
   oda ile nesneler arasında tutarsızlık olur. En azından mobilya malzemelerine aynı ışık terimini
   ekleyecek hafif bir patch düşün (AO kısmı olmadan, sadece ışık).
3. Bu ışık geldikten sonra **ambient/hemisphere dolguyu tekrar kıs** (Adım 2'nin üstüne). Hedef: odanın
   aydınlığının çoğunu tavan lambaları taşısın, ambient sadece köşelerin simsiyah olmasını engellesin.
4. Telefon performansını kontrol et. Lamba sayısı büyük odalarda fazlaysa:
   - **Seçenek A:** Zemin ve tavan için ışığı bir kez CPU'da 2D dokuya önceden hesapla (`roomAo.ts`'teki
     RG alanı gibi), duvarlar analitik kalsın.
   - **Seçenek B:** Fragment başına en yakın N lambayı kullan.
5. Armatür diskinin etrafında, tavanda hafif bir hale de bu terimle ya da çok küçük bir ek ile oluşabilir.

**Ayarlanacak sabitler (dosya başında):** `CEILING_LIGHT_POWER`, `CEILING_LIGHT_LOBE`,
`MAX_CEILING_LIGHTS`, renk (tema `spotColor`).

**Kabul kriteri:**
- Lambaların altında zeminde yumuşak ışık havuzları görünüyor.
- Duvarlarda lambalara yakın üst bölgeler daha aydınlık.
- Bir köşedeki iki duvar farklı parlaklıkta.
- Kaide silindiri bir yanı aydınlık, öbür yanı gölgede okunuyor.
- Masaüstünde 60 FPS; telefonda belirgin düşüş yok.
- CLAUDE.md'deki "GalleryLights.tsx" açıklaması bu yeni ışık katmanını anlatacak şekilde güncellendi.

---

## Adım 7 — Tablo ışığı: tutarlı kaynak, doğru şekil

**Neden:** Duvarda görünen lamba tablonun hemen üstünde, ama gerçek ışık `BEAM_STANDOFF = 1.6`, yani 1,6 m
öteden geliyor. Işık duvara neredeyse dik çarpıyor ve yuvarlak bir sıcak nokta oluşturuyor. Bu noktanın en
parlak yeri lambanın hemen altı, tablonun kendisi değil. Çerçevenin üst kenarında da yapışkan etiket gibi
parlak bir leke var. Gerçek bir tablo lambası duvarı sıyırarak aydınlatır: tablonun üstü daha parlak olur,
aşağı doğru yumuşakça solar ve ışık yanlara geniş bir yelpaze gibi yayılır.

**Dosyalar:** `ArtworkLightPool.tsx`, `ArtworkFixtures.tsx`, `fixtureGeometry.ts`, `Artwork.tsx`
(çerçeve malzemesi), `Scene.tsx` (Bloom).

**Yapılacaklar (iki tutarlı seçenekten birini seç, kullanıcıya sor):**
- **Seçenek A — Tavan ray spotu:** Görünen armatürü tavana yakın bir ray spotuna çevir. Işık o noktadan
  gelsin; uzaklık ve açı fiziksel olarak tutarlı olur. Galerilerde en yaygın çözüm bu.
- **Seçenek B — Tablo lambası:** Armatür kalsın. Işığın çıktığı noktayı lambaya yaklaştır, açıyı genişlet,
  hedefi tablonun ortasına/üst üçte birine al. Işığın tabloya ulaşmama sorunu için açıyı ve hedefi
  tablonun boyutuna göre hesapla. Kodun yorumlarında eski denemenin neden bırakıldığı yazıyor, tekrar okuyup
  aynı tuzağa düşme.

Her iki seçenekte:
1. En parlak nokta **tablonun üzerinde** olmalı, üstündeki duvarda değil.
2. Çerçevedeki parlama lekesi: çerçeve malzemesinin pürüzlülüğünü artır ve/veya Bloom eşiğini kontrol et.
3. Işık havuzu sayısı ve havuz mantığı (`LIGHT_POOL_SIZE`, sabit sayı) değişmesin.

**Kabul kriteri:** Tablo eşit ama tepeden aşağı hafif solarak aydınlanıyor. Duvara yumuşak bir taşma var.
Görünen armatür ile ışığın çıktığı nokta tutarlı. Çerçevede yapay leke yok.

---

## Adım 8 — Çerçeve profili ve tuval girintisi

**Neden:** Çerçeve keskin köşeli düz bir kutu, tuval de ön yüzle aynı hizada. Gerçek çerçevede kavisli ya
da pahlı bir profil olur; tuval 1–2 cm içeride bir girintide durur ve üst iç kenarda ince bir gölge çizgisi
oluşur. Yakından bakıldığında yapaylığı en çok ele veren detaylardan biri bu.

**Dosyalar:** `Artwork.tsx` (`FrameMesh`), `artworkShadow.ts` (`FRAME_BORDER`, `FRAME_DEPTH`),
`textureUv.ts`, `frameTextures.ts`.

**Yapılacaklar:**
1. Çerçeveyi bir **2D profil**den üret: profili `THREE.Shape` ile çiz (dış kenar yuvarlatılmış/pahlı,
   ortası hafif kavisli, içte basamaklı girinti). Dört kenar parçasını bu profilden extrude edip köşelerde
   45° birleştir. Tek bir `buildFrameGeometry(width, height, profile)` fonksiyonu olsun; aynı boyuttaki
   çerçeveler için önbelleğe al.
2. Tuval planını çerçeve ön yüzünden ~1–1,5 cm geriye al. Girintinin iç kenarında AO hissi için ya çok
   ince koyu bir kenar ya da profilin iç yüzünün koyu kalması yeterli.
3. UV'leri profil boyunca düzgün ver ki altın/ceviz dokusu profili takip etsin.
4. "modernBlack" için ince, sade bir profil; "gold" için daha süslü bir profil.
5. Çerçeve önbelleği (`frameMaterialCache`) ve performans korunmalı. Çok tablolu bir odada üçgen sayısına
   ve draw call'a bak.
6. Duvar gölgesi (`artworkShadow.ts`) yeni çerçeve derinliğiyle uyumlu kalmalı.

**Kabul kriteri:** Yakından bakınca çerçeve kavisli bir nesne gibi okunuyor, ışık profilin kenarlarında
parlıyor, tuval içeride duruyor.

---

## Adım 9 — Doku tekrarını kırmak

**Neden:** Tuğla duvarda uzaktan düzenli tekrar eden çapraz çizgiler görünüyor. Parke ve mermer de büyük
alanlarda "kopyalanmış doku" gibi tekdüze. Göz tekrarı anında yakalıyor.

**Dosyalar:** `roomAoMaterial.ts` (tüm oda yüzeylerine zaten patch uygulanıyor, buraya eklemek tek nokta),
`surfaceTextures.ts` (`tileSize`), `GalleryRoom.tsx`.

**Yapılacaklar:**
1. Dünya konumuna göre **düşük frekanslı makro varyasyon** ekle:
   - Albedo'yu (`diffuseColor.rgb`) ±%6–10 oranında, 1–4 m ölçekli bir gürültüyle çarp.
   - Pürüzlülüğü de çok hafif değiştir.
   - Gürültü ucuz olmalı: prosedürel value noise (birkaç ALU) ya da küçük, tekrarlayan bir gürültü dokusu.
   Duvarlar için `xz`'nin duvar yönündeki bileşeni + `y` kullan.
2. Tuğla için daha da etkili bir yöntem, tile'ı her tekrarda rastgele kaydırmak/döndürmek
   ("texture bombing" ya da stochastic sampling). Pahalıysa sadece tuğla ve taş gibi tekrarı belirgin
   dokularda uygula. Önce 1. maddenin yeterli olup olmadığına bak.
3. Gerekirse belirgin dokularda (tuğla, `PavingStones142`) `tileSize`'ı büyüt.
4. Özel renk seçilmiş odalarda (düz renk + nötr sıva taraması) da hafif boya varyasyonu olsun.

**Kabul kriteri:** Tuğla duvara uzaktan bakınca tekrar deseni seçilmiyor. Zemin büyük alanda tekdüze
görünmüyor. FPS değişmiyor.

---

## Adım 10 — Parlak zeminlerde parlama lekeleri (speküler aliasing)

**Neden:** "asdas"ın mermer zemininde uzakta bazı noktalarda bembeyaz, ışıltılı lekeler çıkıyor. Bunlar
normal map ile env yansımasının uzakta titreşip parlamasından kaynaklanıyor.

**Dosyalar:** `GalleryRoom.tsx`, `roomAoMaterial.ts`, `surfaceTextures.ts` (`normalScale`).

**Yapılacaklar:**
1. Normal map'in etkisini kameraya uzaklıkla ya da ekran-uzayı türevleriyle (`fwidth` / `dFdx` /
   `dFdy`) azalt, aynı oranda pürüzlülüğü artır (Toksvig benzeri / "roughness from normal variance").
2. Alternatif: parlak zeminler için pürüzlülük alt sınırını biraz yükselt.
3. Mermer, cilalı beton ve metal zeminlerde, hem duran hem yürüyen kamerayla kontrol et.

**Kabul kriteri:** Yürürken zeminde ışıltı/titreme yok. Yansımalar hâlâ var ama yumuşak.

---

## Adım 11 — Mobilya temas gölgeleri

**Neden:** Sandalye ve kaidelerin altındaki gölge silik bulanık bir dikdörtgen. Nesne zemine oturmuyor,
hafifçe havada duruyor gibi. Gerçekte nesnenin değdiği noktalarda koyu ve keskin, uzaklaştıkça yumuşayan
bir temas gölgesi olur.

**Dosyalar:** `roomAo.ts` (G kanalı: mobilya yakınlığı), `roomAoMaterial.ts`, `galleryLayout.ts`
(`PlacedFurnitureInput`).

**Yapılacaklar:**
1. Mobilya AO'sunu iki katmana ayır: footprint'in tam altında **dar ve koyu** bir çekirdek, çevresinde
   **geniş ve hafif** bir yumuşak gölge.
2. Footprint'i biraz küçült ki gölge nesnenin dışına taşan bir dikdörtgen gibi görünmesin.
3. Yuvarlak tabanlı nesneler (kaide, vazo, bitki) için yuvarlak footprint desteği varsa kullan, yoksa
   ekle.
4. Adım 6'dan sonra tavan lambası ışığı ile tutarlı mı kontrol et.
5. `roomAo.test.ts`'i güncelle.

**Kabul kriteri:** Sandalye ve kaideler zemine oturuyor. Gölgeleri dikdörtgen leke değil.

---

## Adım 12 — Eser görselleri

**Neden:** *Saint-Rémy Geceleri* görselinin üst ve sol kenarında, kaynak fotoğraftan gelen beyaz bir şerit
var. Çerçeve içinde bu çok yapay duruyor.

**Yapılacaklar:**
1. Eser yükleme akışında (`AddArtworkPage.tsx` / `ArtworkForm.tsx`) ya da renderda kenarlardaki düz
   beyaz/siyah boşlukları tespit edip kırpmayı değerlendir. En basiti: yüklemede önizleme + "kenarları
   kırp" seçeneği.
2. Mevcut statik görselleri (`public/artworks/`) kontrol et; kenar boşluğu olanları kırp.

---

## Adım 13 — Vitrin sergisi (kod değil, ama en az kod kadar önemli)

**Neden:** Müşteriye gösterilen sergi ilk izlenimi belirler. Boş, test amaçlı bir oda ("asdas": tablosuz,
beyaz mermer zemin, basık tavan, tuğla) en iyi motorla bile yapay görünür.

**Yapılacaklar:**
- Gerçek tablolarla dolu, özenle hazırlanmış bir **demo sergisi**:
  - Tavan yüksekliği **3,5–4,5 m**. Çok yüksek ve boş duvarlar düz ışığı ele verir.
  - Sakin bir duvar rengi: kırık beyaz, açık gri ya da doygunluğu düşük koyu bir renk. Tam doygun kırmızı
    değil.
  - Tablolar göz hizasında (merkezleri ~1,45–1,55 m), aralarında nefes alacak boşluk.
  - Az ama iyi yerleştirilmiş mobilya: bir bank, bir bitki.
- Her adımdan sonraki önce/sonra ekran görüntülerini bu sergiden al. Müşteriye ilerlemeyi göstermek kolay
  olur.

---

## Önerilen sıra ve tahmini süre

| Adım | Konu | Etki | Süre |
|---|---|---|---|
| 1 | Kamera açısı + hız | Yüksek | ~1 saat |
| 2 | Pozlama / kontrast | Yüksek | ~2 saat |
| 3 | Tavan | Orta | ~1 saat |
| 4 | Vignette + gren | Orta | ~30 dk |
| 5 | Tavan AO lekeleri | Düşük-Orta | ~1 saat |
| **6** | **Tavan lambası ışığı** | **Çok yüksek** | **1–2 gün** |
| 7 | Tablo ışığı | Yüksek | ~yarım gün |
| 8 | Çerçeve profili | Orta-Yüksek | ~yarım gün |
| 9 | Doku tekrarı | Orta | ~yarım gün |
| 10 | Zemin parlamaları | Düşük-Orta | ~2 saat |
| 11 | Mobilya gölgeleri | Orta | ~yarım gün |
| 12 | Eser görselleri | Düşük | ~1 saat |
| 13 | Vitrin sergisi | Çok yüksek (algı) | içerik işi |

1–5 arası hızlı kazançlar, aynı gün bitebilir. 6 ve 7 asıl farkı yaratacak adımlar.

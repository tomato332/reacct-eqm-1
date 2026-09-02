import i18n from './i18n';

export type SupportedLang = 'ko' | 'en' | 'ja' | 'jp';

export function normalizeLang(lang?: string): 'ko' | 'en' | 'ja' {
  const current = lang || i18n.language || 'ko';
  if (current.startsWith('ja') || current.startsWith('jp')) return 'ja';
  if (current.startsWith('en')) return 'en';
  return 'ko';
}

// 1. 47 Prefectures
const PREFECTURE_MAP: Record<string, { ko: string; en: string; ja: string }> = {
  '北海道': { ko: '홋카이도', en: 'Hokkaido', ja: '北海道' },
  '青森県': { ko: '아오모리현', en: 'Aomori', ja: '青森県' },
  '岩手県': { ko: '이와테현', en: 'Iwate', ja: '岩手県' },
  '宮城県': { ko: '미야기현', en: 'Miyagi', ja: '宮城県' },
  '秋田県': { ko: '아키타현', en: 'Akita', ja: '秋田県' },
  '山形県': { ko: '야마가타현', en: 'Yamagata', ja: '山形県' },
  '福島県': { ko: '후쿠시마현', en: 'Fukushima', ja: '福島県' },
  '茨城県': { ko: '이바라키현', en: 'Ibaraki', ja: '茨城県' },
  '栃木県': { ko: '도치기현', en: 'Tochigi', ja: '栃木県' },
  '群馬県': { ko: '군마현', en: 'Gunma', ja: '群馬県' },
  '埼玉県': { ko: '사이타마현', en: 'Saitama', ja: '埼玉県' },
  '千葉県': { ko: '지바현', en: 'Chiba', ja: '千葉県' },
  '東京都': { ko: '도쿄도', en: 'Tokyo', ja: '東京都' },
  '神奈川県': { ko: '가나가와현', en: 'Kanagawa', ja: '神奈川県' },
  '新潟県': { ko: '니가타현', en: 'Niigata', ja: '新潟県' },
  '富山県': { ko: '도야마현', en: 'Toyama', ja: '富山県' },
  '石川県': { ko: '이시카와현', en: 'Ishikawa', ja: '石川県' },
  '福井県': { ko: '후쿠이현', en: 'Fukui', ja: '福井県' },
  '山梨県': { ko: '야마나시현', en: 'Yamanashi', ja: '山梨県' },
  '長野県': { ko: '나가노현', en: 'Nagano', ja: '長野県' },
  '岐阜県': { ko: '기후현', en: 'Gifu', ja: '岐阜県' },
  '静岡県': { ko: '시즈오카현', en: 'Shizuoka', ja: '静岡県' },
  '愛知県': { ko: '아이치현', en: 'Aichi', ja: '愛知県' },
  '三重県': { ko: '미에현', en: 'Mie', ja: '三重県' },
  '滋賀県': { ko: '시가현', en: 'Shiga', ja: '滋賀県' },
  '京都府': { ko: '교토부', en: 'Kyoto', ja: '京都府' },
  '大阪府': { ko: '오사카부', en: 'Osaka', ja: '大阪府' },
  '兵庫県': { ko: '효고현', en: 'Hyogo', ja: '兵庫県' },
  '奈良県': { ko: '나라현', en: 'Nara', ja: '奈良県' },
  '和歌山県': { ko: '와카야마현', en: 'Wakayama', ja: '和歌山県' },
  '鳥取県': { ko: '돗토리현', en: 'Tottori', ja: '鳥取県' },
  '島根県': { ko: '시마네현', en: 'Shimane', ja: '島根県' },
  '岡山県': { ko: '오카야마현', en: 'Okayama', ja: '岡山県' },
  '広島県': { ko: '히로시마현', en: 'Hiroshima', ja: '広島県' },
  '山口県': { ko: '야마구치현', en: 'Yamaguchi', ja: '山口県' },
  '徳島県': { ko: '도쿠시마현', en: 'Tokushima', ja: '徳島県' },
  '香川県': { ko: '가가와현', en: 'Kagawa', ja: '香川県' },
  '愛媛県': { ko: '에히메현', en: 'Ehime', ja: '愛媛県' },
  '高知県': { ko: '고치현', en: 'Kochi', ja: '高知県' },
  '福岡県': { ko: '후쿠오카현', en: 'Fukuoka', ja: '福岡県' },
  '佐賀県': { ko: '사가현', en: 'Saga', ja: '佐賀県' },
  '長崎県': { ko: '나가사키현', en: 'Nagasaki', ja: '長崎県' },
  '熊本県': { ko: '구마모토현', en: 'Kumamoto', ja: '熊本県' },
  '大分県': { ko: '오이타현', en: 'Oita', ja: '大分県' },
  '宮崎県': { ko: '미야자키현', en: 'Miyazaki', ja: '宮崎県' },
  '鹿児島県': { ko: '가고시마현', en: 'Kagoshima', ja: '鹿児島県' },
  '沖縄県': { ko: '오키나와현', en: 'Okinawa', ja: '沖縄県' }
};

// 2. Specific Region Keywords & Root Words
const REGION_ROOTS: Record<string, { ko: string; en: string }> = {
  // 해역 및 만, 해협
  '三陸': { ko: '산리쿠', en: 'Sanriku' },
  '東京湾': { ko: '도쿄만', en: 'Tokyo Bay' },
  '相模湾': { ko: '사가미만', en: 'Sagami Bay' },
  '駿河湾': { ko: '스루가만', en: 'Suruga Bay' },
  '遠州灘': { ko: '엔슈나다', en: 'Enshu-nada' },
  '熊野灘': { ko: '구마노나다', en: 'Kumano-nada' },
  '紀伊水道': { ko: '키이 수도', en: 'Kii Channel' },
  '播磨灘': { ko: '하리마나다', en: 'Harima-nada' },
  '大阪湾': { ko: '오사카만', en: 'Osaka Bay' },
  '伊予灘': { ko: '이요나다', en: 'Iyo-nada' },
  '豊後水道': { ko: '분고 수도', en: 'Bungo Channel' },
  '日向灘': { ko: '휴가나다', en: 'Hyuga-nada' },
  '若狭湾': { ko: '와카사만', en: 'Wakasa Bay' },
  '富山湾': { ko: '도야마만', en: 'Toyama Bay' },
  '伊勢湾': { ko: '이세만', en: 'Ise Bay' },
  '三河湾': { ko: '미카와만', en: 'Mikawa Bay' },
  '陸奥湾': { ko: '무쓰만', en: 'Mutsu Bay' },
  '橘湾': { ko: '다치바나만', en: 'Tachibana Bay' },
  '鹿児島湾': { ko: '가고시마만', en: 'Kagoshima Bay' },
  '八代海': { ko: '야쓰시로해', en: 'Yatsushiro Sea' },
  '有明海': { ko: '아리아케해', en: 'Ariake Sea' },
  '天草灘': { ko: '아마쿠사나다', en: 'Amakusa-nada' },
  '五島灘': { ko: '고토나다', en: 'Goto-nada' },
  '玄界灘': { ko: '겐카이나다', en: 'Genkai-nada' },
  '響灘': { ko: '히비키나다', en: 'Hibiki-nada' },
  '周防灘': { ko: '스오나다', en: 'Suo-nada' },
  '安芸灘': { ko: '아키나다', en: 'Aki-nada' },
  '瀬戸内海': { ko: '세토내해', en: 'Seto Inland Sea' },
  '日本海': { ko: '일본해(동해)', en: 'Sea of Japan' },
  'オホーツク海': { ko: '오호츠크해', en: 'Sea of Okhotsk' },
  '東シナ海': { ko: '동중국해', en: 'East China Sea' },
  '太平洋': { ko: '태평양', en: 'Pacific Ocean' },

  // 섬 및 제도
  '千島列島': { ko: '쿠릴 열도', en: 'Kuril Islands' },
  '小笠原諸島': { ko: '오가사와라 제도', en: 'Ogasawara Islands' },
  '伊豆諸島': { ko: '이즈 제도', en: 'Izu Islands' },
  '奄美大島': { ko: '아마미오시마', en: 'Amami Oshima' },
  '沖縄本島': { ko: '오키나와 본섬', en: 'Okinawa Main Island' },
  '宮古島': { ko: '미야코지마', en: 'Miyakojima' },
  '石垣島': { ko: '이시가키지마', en: 'Ishigakijima' },
  '西表島': { ko: '이리오모테지마', en: 'Iriomotejima' },
  '与那国島': { ko: '요나구니지마', en: 'Yonagunijima' },
  '種子島': { ko: '다네가시마', en: 'Tanegashima' },
  '屋久島': { ko: '야쿠시마', en: 'Yakushima' },
  'トカラ列島': { ko: '토카라 열도', en: 'Tokara Islands' },
  '薩南諸島': { ko: '사쓰난 제도', en: 'Satsunan Islands' },
  '大東島': { ko: '다이토지마', en: 'Daitojima' },
  '台湾': { ko: '대만', en: 'Taiwan' },
  '佐渡': { ko: '사도섬', en: 'Sado Island' },
  '隠岐': { ko: '오키 제도', en: 'Oki Islands' },
  '対馬': { ko: '쓰시마(대마도)', en: 'Tsushima' },
  '壱岐': { ko: '이키섬', en: 'Iki Island' },
  '五島列島': { ko: '고토 열도', en: 'Goto Islands' },
  '淡路島': { ko: '아와지시마', en: 'Awaji Island' },
  '八丈島': { ko: '하치조지마', en: 'Hachijojima' },
  '三宅島': { ko: '미야케지마', en: 'Miyakejima' },
  '伊豆大島': { ko: '이즈오시마', en: 'Izu Oshima' },
  '新島': { ko: '니이지마', en: 'Niijima' },
  '神津島': { ko: '고즈시마', en: 'Kozushima' },
  '父島': { ko: '지지마', en: 'Chichijima' },
  '母島': { ko: '하하지마', en: 'Hahajima' },
  '硫黄島': { ko: '이오지마', en: 'Iwo Jima' },
  '択捉島': { ko: '이투루프섬', en: 'Etorofu (Iturup) Island' },
  '国後島': { ko: '쿠나시르섬', en: 'Kunashiri (Kunashir) Island' },
  '色丹島': { ko: '시코탄섬', en: 'Shikotan Island' },
  '歯舞群島': { ko: '하보마이 군도', en: 'Habomai Islands' },

  // 반도, 지방 이름들
  '能登半島': { ko: '노토반도', en: 'Noto Peninsula' },
  '根室半島': { ko: '네무로반도', en: 'Nemuro Peninsula' },
  '島原半島': { ko: '시마바라 반도', en: 'Shimabara Peninsula' },
  '国東半島': { ko: '구니사키 반도', en: 'Kunisaki Peninsula' },
  '下北半島': { ko: '시모키타 반도', en: 'Shimokita Peninsula' },
  '津軽半島': { ko: '쓰가루 반도', en: 'Tsugaru Peninsula' },
  '伊豆半島': { ko: '이즈 반도', en: 'Izu Peninsula' },
  '房総半島': { ko: '보소 반도', en: 'Boso Peninsula' },
  '三浦半島': { ko: '미우라 반도', en: 'Miura Peninsula' },
  '知床半島': { ko: '시레토코 반도', en: 'Shiretoko Peninsula' },
  '渡島半島': { ko: '오시마 반도', en: 'Oshima Peninsula' },
  '紀伊半島': { ko: '키이 반도', en: 'Kii Peninsula' },
  '薩摩半島': { ko: '사쓰마 반도', en: 'Satsuma Peninsula' },
  '大隅半島': { ko: '오스미 반도', en: 'Osumi Peninsula' },

  // 세부 지방 이름 (도도부현 외)
  '石狩': { ko: '이시카리', en: 'Ishikari' },
  '渡島': { ko: '오시마', en: 'Oshima' },
  '檜山': { ko: '히야마', en: 'Hiyama' },
  '後志': { ko: '시리베시', en: 'Shiribeshi' },
  '空知': { ko: '소라치', en: 'Sorachi' },
  '上川': { ko: '가미카와', en: 'Kamikawa' },
  '留萌': { ko: '루모이', en: 'Rumoi' },
  '宗谷': { ko: '소야', en: 'Soya' },
  'オホーツク': { ko: '오호츠크', en: 'Okhotsk' },
  '胆振': { ko: '이부리', en: 'Iburi' },
  '日高': { ko: '히다카', en: 'Hidaka' },
  '十勝': { ko: '도카치', en: 'Tokachi' },
  '釧路': { ko: '구시로', en: 'Kushiro' },
  '根室': { ko: '네무로', en: 'Nemuro' },
  '下北': { ko: '시모키타', en: 'Shimokita' },
  '津軽': { ko: '쓰가루', en: 'Tsugaru' },
  '三八上北': { ko: '산파치카미키타', en: 'Sanpachi Kamikita' },
  '中通り': { ko: '나카도리', en: 'Nakadori' },
  '浜通り': { ko: '하마도리', en: 'Hamadori' },
  '会津': { ko: '아이즈', en: 'Aizu' },
  '村山': { ko: '무라야마', en: 'Murayama' },
  '置賜': { ko: '오키타마', en: 'Okitama' },
  '庄内': { ko: '쇼나이', en: 'Shonai' },
  '最上': { ko: '모가미', en: 'Mogami' },
  '中越': { ko: '주에쓰', en: 'Chuetsu' },
  '上越': { ko: '조에쓰', en: 'Joetsu' },
  '下越': { ko: '가에쓰', en: 'Kaetsu' },
  '能登': { ko: '노토', en: 'Noto' },
  '加賀': { ko: '가가', en: 'Kaga' },
  '嶺北': { ko: '레이호쿠', en: 'Reihoku' },
  '嶺南': { ko: '레이난', en: 'Reinan' },
  '天草': { ko: '아마쿠사', en: 'Amakusa' },
  '芦北': { ko: '아시키타', en: 'Ashikita' },
  '阿蘇': { ko: '아소', en: 'Aso' },
  '球磨': { ko: '구마', en: 'Kuma' },
  '薩摩': { ko: '사쓰마', en: 'Satsuma' },
  '大隅': { ko: '오스미', en: 'Osumi' },
  '豊後': { ko: '분고', en: 'Bungo' },
  '筑豊': { ko: '지쿠호', en: 'Chikuho' },
  '筑後': { ko: '지쿠고', en: 'Chikugo' },
  
  // 방향, 지형 등
  '浦河': { ko: '우라카와', en: 'Urakawa' },
  '苫小牧': { ko: '도마코마이', en: 'Tomakomai' },
  '網走': { ko: '아바시리', en: 'Abashiri' },
  '宗谷海峡': { ko: '소야 해협', en: 'Soya Strait' },
  '津軽海峡': { ko: '쓰가루 해협', en: 'Tsugaru Strait' },
};

// 3. 접미사/위치/방향 사전 (정규식 기반 치환) - 우선순위를 위해 긴 단어부터 배열
const MODIFIERS_KO: [RegExp, string][] = [
  [/東南東/g, ' 동남동'], [/西南西/g, ' 서남서'], [/東北東/g, ' 동북동'], [/西北西/g, ' 서북西'],
  [/南東/g, ' 남동'], [/南西/g, ' 남서'], [/北東/g, ' 북동'], [/北西/g, ' 북서'],
  [/南部/g, ' 남부'], [/北部/g, ' 북부'], [/東部/g, ' 동부'], [/西部/g, ' 서부'], [/中部/g, ' 중부'],
  [/南/g, ' 남'], [/北/g, ' 북'], [/東/g, ' 동'], [/西/g, ' 서'],
  [/東方沖/g, ' 동쪽 앞바다'], [/西方沖/g, ' 서쪽 앞바다'], [/南方沖/g, ' 남쪽 앞바다'], [/北方沖/g, ' 북쪽 앞바다'],
  [/南東沖/g, ' 남동쪽 앞바다'], [/北東沖/g, ' 북동쪽 앞바다'], [/南西沖/g, ' 남서쪽 앞바다'], [/北西沖/g, ' 북서쪽 앞바다'],
  [/沿岸/g, ' 연안'], [/内陸/g, ' 내륙'],
  [/沖/g, ' 앞바다'], [/近海/g, ' 근해'], [/付近/g, ' 부근'],
  [/地方/g, ' 지방'], [/半島/g, ' 반도'], [/諸島/g, ' 제도'], [/列島/g, ' 열도'], [/群島/g, ' 군도'],
  [/湾/g, '만'], [/灘/g, '나다'], [/海峡/g, '해협'], [/水道/g, '수도'],
  [/・/g, '·']
];

const MODIFIERS_EN: [RegExp, string][] = [
  [/東南東/g, ' ESE'], [/西南西/g, ' WSW'], [/東北東/g, ' ENE'], [/西北西/g, ' WNW'],
  [/南東/g, ' SE'], [/南西/g, ' SW'], [/北東/g, ' NE'], [/北西/g, ' NW'],
  [/南部/g, ' South'], [/北部/g, ' North'], [/東部/g, ' East'], [/西部/g, ' West'], [/中部/g, ' Central'],
  [/南/g, ' South'], [/北/g, ' North'], [/東/g, ' East'], [/西/g, ' West'],
  [/東方沖/g, ' Off East Coast'], [/西方沖/g, ' Off West Coast'], [/南方沖/g, ' Off South Coast'], [/北方沖/g, ' Off North Coast'],
  [/南東沖/g, ' Off SE Coast'], [/北東沖/g, ' Off NE Coast'], [/南西沖/g, ' Off SW Coast'], [/北西沖/g, ' Off NW Coast'],
  [/沿岸/g, ' Coastal'], [/内陸/g, ' Inland'],
  [/沖/g, ' Off Coast'], [/近海/g, ' Near'], [/付近/g, ' Near'],
  [/地方/g, ' Area'], [/半島/g, ' Peninsula'], [/諸島/g, ' Islands'], [/列島/g, ' Islands'], [/群島/g, ' Islands'],
  [/湾/g, ' Bay'], [/灘/g, ' Sea'], [/海峡/g, ' Strait'], [/水道/g, ' Channel'],
  [/・/g, ' / ']
];

/**
 * 도도부현 명칭을 다국어로 번역합니다.
 */
export function translatePrefecture(pref: string, lang?: string): string {
  if (!pref) return '';
  const currentLang = normalizeLang(lang);
  const trimmed = pref.trim();
  if (currentLang === 'ja') return trimmed;

  if (PREFECTURE_MAP[trimmed]) {
    return PREFECTURE_MAP[trimmed][currentLang];
  }

  for (const [jp, trans] of Object.entries(PREFECTURE_MAP)) {
    if (trimmed.includes(jp)) {
      return trimmed.replace(jp, trans[currentLang]);
    }
  }
  return trimmed;
}

/**
 * 진원지 또는 지역 명칭을 다국어로 정교하게 번역합니다.
 * - 조합형 지명(예: 石川県能登地方, 沖縄本島南西沖 등)을 자연스럽게 분해하여 번역합니다.
 */
export function translateRegionName(name: string, lang?: string): string {
  const currentLang = normalizeLang(lang);
  if (!name) {
    if (currentLang === 'en') return 'Unknown Epicenter';
    if (currentLang === 'ja') return '震源地不明';
    return '진원지 불명';
  }

  const trimmed = name.trim();
  if (currentLang === 'ja') return trimmed;

  let result = trimmed;
  let translatedParts: string[] = [];

  // 영어의 경우 접두사/접미사 순서가 다르므로, 영어 번역 조합을 위해 분리합니다.
  if (currentLang === 'en') {
    // 1. 도도부현 치환
    for (const [jpPref, trans] of Object.entries(PREFECTURE_MAP)) {
      if (result.startsWith(jpPref)) {
        result = result.replace(jpPref, `_PREF_${trans.en}_`);
        break;
      }
    }
    // 2. 지역 뿌리 단어 치환 (길이 순으로 정렬하여 긴 단어 우선 매칭)
    const sortedRoots = Object.entries(REGION_ROOTS).sort((a, b) => b[0].length - a[0].length);
    for (const [jpKey, trans] of sortedRoots) {
      if (result.includes(jpKey)) {
        result = result.replace(jpKey, `_ROOT_${trans.en}_`);
      }
    }
    // 3. 접미사 및 방향 치환
    for (const [regex, replacement] of MODIFIERS_EN) {
      result = result.replace(regex, `_MOD_${replacement.trim()}_`);
    }

    // _MOD_, _ROOT_, _PREF_ 를 조합하여 자연스러운 영어 문장으로 조립 (ex: Off Coast of Noto Peninsula, Ishikawa)
    // 간단한 클리닝 및 조합
    result = result.replace(/_PREF_([^_]+)_/g, ' $1');
    result = result.replace(/_ROOT_([^_]+)_/g, ' $1');
    result = result.replace(/_MOD_([^_]+)_/g, ' $1');
    
    // 영어 어순 교정 (Near XXX, Off Coast of XXX 등)
    if (result.includes('Off Coast') && !result.startsWith('Off Coast')) {
       // ex) Ishikawa Noto Peninsula Off Coast -> Off Coast of Noto Peninsula, Ishikawa
       const parts = result.split('Off Coast');
       if (parts[0].trim().length > 0) {
         result = `Off Coast of ${parts[0].trim()}`;
       }
    } else if (result.includes('Near') && !result.startsWith('Near')) {
       const parts = result.split('Near');
       if (parts[0].trim().length > 0) {
         result = `Near ${parts[0].trim()}`;
       }
    }

    // 중복 스페이스 및 , 정리
    result = result.replace(/s+/g, ' ').trim();
    // 일부 어색한 결합 교정
    result = result.replace(/ Prefecture/g, ''); // 보통 빼는게 자연스러움
    return result;

  } else {
    // 한국어 처리 로직 (일본어 어순과 동일하므로 순차적 치환이 매우 잘 통함)
    
    // 1. 도도부현 치환
    for (const [jpPref, trans] of Object.entries(PREFECTURE_MAP)) {
      if (result.startsWith(jpPref)) {
        result = result.replace(jpPref, trans.ko + ' ');
        break;
      }
    }
    
    // 2. 지역 뿌리 단어 치환 (길이 순 정렬)
    const sortedRoots = Object.entries(REGION_ROOTS).sort((a, b) => b[0].length - a[0].length);
    for (const [jpKey, trans] of sortedRoots) {
      if (result.includes(jpKey)) {
        result = result.replace(jpKey, trans.ko);
      }
    }

    // 3. 방위 및 접미사 치환
    for (const [regex, replacement] of MODIFIERS_KO) {
      result = result.replace(regex, replacement);
    }
    
    // 4. 스페이스 정리
    result = result.replace(/s+/g, ' ').trim();
    return result;
  }
}

/**
 * 관측소 상세 명칭(시/구/정/촌 포함)을 다국어로 가공합니다.
 */
export function formatObservationPointName(
  pref: string,
  name: string,
  lang?: string
): { prefTranslated: string; nameTranslated: string; fullTranslated: string } {
  const currentLang = normalizeLang(lang);
  const prefTranslated = translatePrefecture(pref, currentLang);
  
  // 시/구/정/촌에 대한 한국어 정밀 치환 규칙
  let nameTranslated = name;
  if (currentLang === 'ko') {
    // 지역 명칭 치환 후 남은 행정구역 단위 번역
    nameTranslated = translateRegionName(name, currentLang);
    nameTranslated = nameTranslated
      .replace(/市/g, '시')
      .replace(/区/g, '구')
      .replace(/町/g, '정')
      .replace(/村/g, '촌');
  } else if (currentLang === 'en') {
    nameTranslated = translateRegionName(name, currentLang);
    nameTranslated = nameTranslated
      .replace(/市/g, ' City')
      .replace(/区/g, ' Ward')
      .replace(/町/g, ' Town')
      .replace(/村/g, ' Village');
  }

  // 중복되는 도도부현 이름 제거 (ex: 이시카와현 이시카와현 노토시 -> 이시카와현 노토시)
  if (currentLang !== 'ja' && prefTranslated && nameTranslated.startsWith(prefTranslated)) {
    nameTranslated = nameTranslated.substring(prefTranslated.length).trim();
  }

  const fullTranslated =
    currentLang === 'ja'
      ? `${pref} ${name}`
      : prefTranslated
      ? `${prefTranslated} ${nameTranslated || name}`
      : nameTranslated || name;

  return { prefTranslated, nameTranslated: nameTranslated || name, fullTranslated };
}

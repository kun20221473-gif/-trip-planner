import { GoogleGenAI, Type } from "@google/genai";

// 환경변수에서 Gemini API Key 가져오기
const apiKey = process.env.GEMINI_API_KEY;

// Vercel Serverless Function Handler
export default async function handler(req, res) {
  // CORS 처리 (필요시) 및 POST 메서드 검증
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: '서버에 GEMINI_API_KEY 설정이 필요합니다.' });
  }

  try {
    const { destination, duration, companion, interests } = req.body || {};

    // 1. 유효성 검사 및 간단한 프롬프트 주입 검증
    if (!destination) {
      return res.status(400).json({ error: '여행지(destination) 정보는 필수입니다.' });
    }

    // Google Gen AI SDK 초기화
    const ai = new GoogleGenAI({ apiKey });

    // 2. 프롬프트 구성 (가드레일 및 답변 규칙 정의)
    const prompt = `
당신은 베테랑 여행 플래너입니다. 아래 요청 정보를 바탕으로 여행 일정을 계획해 주세요.

[요청 정보]
- 여행지: ${destination}
- 기간: ${duration}일 (예: 3일이면 1일차, 2일차, 3일차로 총 ${duration}개의 day 항목을 생성하세요)
- 누구와: ${companion}
- 관심사 및 여행 스타일: ${Array.isArray(interests) ? interests.join(', ') : interests || '기본'}

[작성 규칙 & 가드레일]
1. 여행 및 일정 계획과 관련 없는 요청(예: 프로그래밍 문제, 코딩 질문, 다른 주제의 에세이 요구 등)은 거절해야 합니다. 여행 관련 요청이 아닌 경우, title에 "여행 관련 요청이 아닙니다"로 출력해 주세요.
2. 각 장소의 영업시간, 입장료, 메뉴 가격 등 변동성이 있는 정보는 절대로 확정적으로 단정하지 마세요. (예: "방문 전 공식 사이트나 지도 앱에서 최신 영업시간 및 휴무일을 확인하세요" 형태의 안내 문구 포함)
3. 해당 여행지 및 동행자 성향에 맞추어 효율적인 동선으로 작성해 주세요.
4. icon 명칭은 FontAwesome 6 계열 클래스명 중 정확히 하나를 선택해 넣으세요 (예: fa-utensils, fa-camera, fa-bowl-food, fa-leaf, fa-moon, fa-coffee, fa-hotel, fa-bus, fa-compass, fa-shoeprints).
`;

    // 3. 응답 JSON 구조 정의 (Structured Output Schema)
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: "여행 전체 타이틀 (예: 제주도 2박 3일 감성 힐링 여행)",
        },
        subtitle: {
          type: Type.STRING,
          description: "여행 요약 서브타이틀 (예: 2박 3일 · 연인과 · 맛집/카페, 힐링)",
        },
        itinerary: {
          type: Type.ARRAY,
          description: "하루별 여행 일정 목록",
          items: {
            type: Type.OBJECT,
            properties: {
              day: {
                type: Type.INTEGER,
                description: "일차 번호 (예: 1, 2, 3)",
              },
              theme: {
                type: Type.STRING,
                description: "해당 날짜의 테마 또는 요약",
              },
              items: {
                type: Type.ARRAY,
                description: "해당 날짜의 시간대별 코스 카드 목록",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: {
                      type: Type.STRING,
                      description: "추천 시각 (예: 09:30)",
                    },
                    category: {
                      type: Type.STRING,
                      description: "카테고리 구분 (예: 아침, 오전 코스, 점심, 오후, 저녁/야경)",
                    },
                    title: {
                      type: Type.STRING,
                      description: "장소 또는 활동 이름",
                    },
                    desc: {
                      type: Type.STRING,
                      description: "상세 설명 및 동선 팁 (영업시간/요금 등 변동 가능성에 대한 유의사항 포함)",
                    },
                    tag: {
                      type: Type.STRING,
                      description: "태그 (예: 맛집, 힐링, 관광, 카페, 산책)",
                    },
                    icon: {
                      type: Type.STRING,
                      description: "FontAwesome 아이콘 클래스명 (예: fa-utensils, fa-camera, fa-bowl-food, fa-coffee, fa-leaf, fa-moon, fa-hotel)",
                    },
                  },
                  required: ["time", "category", "title", "desc", "tag", "icon"],
                },
              },
            },
            required: ["day", "theme", "items"],
          },
        },
      },
      required: ["title", "subtitle", "itinerary"],
    };

    // 4. gemini-3.8-flash 모델 호출
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.7,
      },
    });

    // 5. JSON 응답 결과 파싱 및 전송
    const responseText = response.text;
    const resultJson = JSON.parse(responseText);

    return res.status(200).json(resultJson);

  } catch (error) {
    console.error('Plan API Error:', error);
    return res.status(500).json({ 
      error: '일정을 생성하는 중에 오류가 발생했습니다.', 
      details: error.message 
    });
  }
}

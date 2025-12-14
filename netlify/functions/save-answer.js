exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    /* ===============================
       환경변수
    =============================== */
    const {
      GITHUB_TOKEN,
      GITHUB_USERNAME,
      REPO_NAME,
      GITHUB_BRANCH = 'main',
      DID_API_KEY,
      KNOWLEDGE_ID
    } = process.env;

    if (!GITHUB_TOKEN || !GITHUB_USERNAME || !REPO_NAME) {
      throw new Error('GitHub 환경변수가 누락되었습니다.');
    }

    /* ===============================
       요청 데이터 (화투 인지훈련 전용)
    =============================== */
    const {
      userName,
      cards,          // [{ m, n, s }]
      answers,        // { mem, calc, class }
      sum,            // 월 합
      season,         // 정답 계절
      timestamp
    } = JSON.parse(event.body);

    if (!userName || !cards || !answers) {
      throw new Error('요청 데이터가 올바르지 않습니다.');
    }

    /* ===============================
       결과 판정
    =============================== */
    const memoryCorrect = answers.mem === cards[0].n;
    const calcCorrect   = Number(answers.calc) === Number(sum);
    const classCorrect  = answers.class === season;

    /* ===============================
       Knowledge 문서 (아바타 최적화)
    =============================== */
    const fileContent = `
[${new Date(timestamp).toLocaleDateString('ko-KR')} 화투 인지훈련 기록]

이름: ${userName}

오늘의 화투 카드:
${cards.map(c => `- ${c.m}월 ${c.n} (${c.s})`).join('\n')}

인지훈련 결과 요약:
- 기억 훈련: ${memoryCorrect ? '첫 번째 화투패를 정확히 기억함' : '첫 번째 화투패 기억에 어려움이 있었음'}
- 계산 훈련: ${calcCorrect ? `월의 합 ${sum}을 정확히 계산함` : '월의 합 계산에서 혼동이 있었음'}
- 분류 훈련: ${classCorrect ? `${season} 계절로 올바르게 분류함` : '계절 분류에서 혼동이 있었음'}

종합 평가:
화투 이미지를 활용한 기억, 계산, 분류 인지 자극 활동을 수행함.
천천히 문제를 해결하려는 태도가 관찰되었으며,
일상적인 놀이 기반 인지 훈련으로 활용 가능함.
`.trim();

    /* ===============================
       파일명 (ASCII만)
    =============================== */
    const fileName = `hwatu_${Date.now()}.txt`;
    const fileContentBase64 =
      Buffer.from(fileContent, 'utf-8').toString('base64');

    /* ===============================
       GitHub 업로드
    =============================== */
    const githubApiUrl =
      `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${fileName}`;

    const githubResponse = await fetch(githubApiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Add hwatu cognitive result (${userName})`,
        content: fileContentBase64,
        branch: GITHUB_BRANCH
      })
    });

    const githubText = await githubResponse.text();
    console.log('GitHub status:', githubResponse.status);
    console.log('GitHub response:', githubText);

    if (!githubResponse.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'GitHub 저장 실패',
          detail: githubText
        })
      };
    }

    /* ===============================
       Raw URL (D-ID Knowledge용)
    =============================== */
    const rawUrl =
      `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${REPO_NAME}/${GITHUB_BRANCH}/${fileName}`;

    /* ===============================
       D-ID Knowledge 등록
    =============================== */
    if (DID_API_KEY && KNOWLEDGE_ID) {
      const didResponse = await fetch(
        `https://api.d-id.com/knowledge/${KNOWLEDGE_ID}/documents`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${DID_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            documentType: 'text',
            source_url: rawUrl,
            title: `${userName}_화투_인지훈련_기록`
          })
        }
      );

      const didText = await didResponse.text();
      console.log('D-ID status:', didResponse.status);
      console.log('D-ID response:', didText);

      if (!didResponse.ok) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'D-ID Knowledge 등록 실패',
            detail: didText,
            githubUrl: rawUrl
          })
        };
      }
    }

    /* ===============================
       성공
    =============================== */
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '화투 인지훈련 결과가 저장 및 Knowledge에 반영되었습니다.',
        githubUrl: rawUrl
      })
    };

  } catch (err) {
    console.error('Function error:', err);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: '서버 처리 중 오류 발생',
        detail: err.message
      })
    };
  }
};

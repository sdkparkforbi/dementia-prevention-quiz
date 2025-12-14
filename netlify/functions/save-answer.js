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
       요청 데이터 (최종 HTML 기준)
    =============================== */
    const {
      userName,
      cards,        // [{id,n,img}]
      recall,       // 기억 맞힌 개수 (0~3)
      wordScore,    // 낱말 퀴즈 점수 (0~5)
      healthScore,  // 치매예방 상식 점수 (0~5)
      timestamp
    } = JSON.parse(event.body);

    if (!userName || !cards || !timestamp) {
      throw new Error('요청 데이터가 올바르지 않습니다.');
    }

    /* ===============================
       Knowledge 문서 (아바타 최적화)
    =============================== */
    const fileContent = `
[오늘의 두뇌 활동 기록]

이름: ${userName}
날짜: ${new Date(timestamp).toLocaleString('ko-KR')}

화투 기억 미션:
- 선택한 카드: ${cards.map(c => c.n).join(', ')}
- 다시 맞힌 카드 수: ${recall} / 3

문해력 활동 (낱말 퀴즈):
- 점수: ${wordScore} / 5

치매 예방 상식 퀴즈:
- 점수: ${healthScore} / 5

종합 평가:
화투를 활용한 기억 훈련과 낱말 중심의 언어 자극 활동을 수행함.
놀이 형태의 인지 활동을 통해 기억력과 언어 기능을 고르게 사용함.
일상적인 치매 예방 루틴으로 적절한 수준의 인지 자극이 이루어짐.
`.trim();

    /* ===============================
       파일명 (ASCII만 사용)
    =============================== */
    const fileName = `cognitive_${Date.now()}.txt`;
    const fileContentBase64 =
      Buffer.from(fileContent, 'utf-8').toString('base64');

    /* ===============================
       GitHub 파일 저장
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
        message: `Add cognitive activity result (${userName})`,
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
            title: `${userName}_두뇌활동_기록`
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
       성공 응답
    =============================== */
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '두뇌 활동 결과가 저장되었습니다.',
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

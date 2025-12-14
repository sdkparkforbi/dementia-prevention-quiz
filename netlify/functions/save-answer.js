exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
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
      GITHUB_BRANCH = "main",
      DID_API_KEY,
      KNOWLEDGE_ID,
    } = process.env;

    if (!GITHUB_TOKEN || !GITHUB_USERNAME || !REPO_NAME) {
      throw new Error("GitHub 환경변수가 누락되었습니다. (GITHUB_TOKEN/USERNAME/REPO_NAME)");
    }

    /* ===============================
       요청 데이터
    =============================== */
    const payload = JSON.parse(event.body || "{}");

    const {
      userName,
      sessionId,
      startedAt,
      endedAt,
      hwatu,
      word,
      dementia,
    } = payload;

    if (!userName || !sessionId) {
      throw new Error("요청 데이터가 누락되었습니다. (userName/sessionId)");
    }

    /* ===============================
       텍스트 문서 생성
    =============================== */
    const toKST = (iso) => {
      try {
        return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      } catch (e) {
        return String(iso || "");
      }
    };

    const safe = (v) => (v === null || v === undefined ? "" : String(v));

    const hwatuPicked = (hwatu?.picked || []).map((c) => c.label || c.key || c.id).join(", ");
    const hwatuRecallPicked = (hwatu?.recallPicked || []).map((c) => c.label || c.key || c.id).join(", ");

    const wordResults = (word?.results || []).map((r, i) => {
      return [
        `문항 ${i + 1}`,
        `질문: ${safe(r.question)}`,
        `선택: ${safe(r.userAnswer)}`,
        `정답: ${safe(r.correctAnswer)}`,
        `결과: ${r.isCorrect ? "정답" : "오답"}`,
        `설명: ${safe(r.explanation)}`,
      ].join("\n");
    }).join("\n\n");

    const dementiaResults = (dementia?.results || []).map((r, i) => {
      return [
        `문제 ${i + 1}`,
        `질문: ${safe(r.question)}`,
        `선택: ${safe(r.userAnswer)}`,
        `정답: ${safe(r.correctAnswer)}`,
        `결과: ${r.isCorrect ? "정답" : "오답"}`,
        `해설: ${safe(r.explanation)}`,
      ].join("\n");
    }).join("\n\n");

    // 아바타가 쉽게 읽도록 "요약 블록"을 문서 상단에 둡니다.
    const summaryLines = [
      `세션 요약`,
      `- 이름: ${userName}`,
      `- 세션: ${sessionId}`,
      `- 화투 회상: ${hwatu?.recallCorrect ?? 0} / ${hwatu?.recallTotal ?? 3}`,
      `- 낱말 퀴즈: ${word?.score ?? 0} / ${word?.total ?? 0}`,
      `- 치매예방 퀴즈: ${dementia?.score ?? 0} / ${dementia?.total ?? 0}`,
    ].join("\n");

    const fileContent = [
      `오늘의 두뇌 활동 결과 기록`,
      `========================================`,
      summaryLines,
      ``,
      `시간`,
      `- 시작: ${toKST(startedAt)}`,
      `- 종료: ${toKST(endedAt)}`,
      ``,
      `----------------------------------------`,
      `1) 화투 운세 & 기억 훈련`,
      `----------------------------------------`,
      `선택 카드(3장): ${hwatuPicked || "(없음)"}`,
      `회상 선택(3장): ${hwatuRecallPicked || "(없음)"}`,
      `회상 정답: ${hwatu?.recallCorrect ?? 0} / ${hwatu?.recallTotal ?? 3}`,
      `기억 보기 시간(ms): ${hwatu?.memoryShownMs ?? ""}`,
      `기억 단계 경과(ms): ${hwatu?.memoryElapsedMs ?? ""}`,
      `회상 단계 경과(ms): ${hwatu?.recallElapsedMs ?? ""}`,
      ``,
      `----------------------------------------`,
      `2) 낱말 퀴즈(문해력)`,
      `----------------------------------------`,
      `점수: ${word?.score ?? 0} / ${word?.total ?? 0}`,
      ``,
      wordResults || "(결과 없음)",
      ``,
      `----------------------------------------`,
      `3) 치매 예방 퀴즈(지식)`,
      `----------------------------------------`,
      `점수: ${dementia?.score ?? 0} / ${dementia?.total ?? 0}`,
      ``,
      dementiaResults || "(결과 없음)",
      ``,
      `----------------------------------------`,
      `아바타 안내용 한마디`,
      `----------------------------------------`,
      `오늘도 두뇌 활동을 해주셔서 고맙습니다. 다음에 다시 해보시면 변화도 함께 볼 수 있어요.`,
      ``,
    ].join("\n");

    /* ===============================
       파일명 (ASCII만)
    =============================== */
    const fileName = `session_${sessionId}_${Date.now()}.txt`;
    const fileContentBase64 = Buffer.from(fileContent, "utf-8").toString("base64");

    /* ===============================
       GitHub 파일 생성
    =============================== */
    const githubApiUrl =
      `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${fileName}`;

    const githubResponse = await fetch(githubApiUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Add session result (${userName} / ${sessionId})`,
        content: fileContentBase64,
        branch: GITHUB_BRANCH,
      }),
    });

    const githubText = await githubResponse.text();
    if (!githubResponse.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "GitHub 저장 실패",
          detail: githubText,
        }),
      };
    }

    /* ===============================
       Raw URL (D-ID용)
    =============================== */
    const rawUrl =
      `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${REPO_NAME}/${GITHUB_BRANCH}/${fileName}`;

    /* ===============================
       D-ID Knowledge 등록 (옵션)
       - DID_API_KEY & KNOWLEDGE_ID 있을 때만
    =============================== */
    if (DID_API_KEY && KNOWLEDGE_ID) {
      const didResponse = await fetch(
        `https://api.d-id.com/knowledge/${KNOWLEDGE_ID}/documents`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${DID_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            documentType: "text",
            source_url: rawUrl,
            title: `${userName}_두뇌활동_${sessionId}`,
          }),
        }
      );

      const didText = await didResponse.text();
      if (!didResponse.ok) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: "D-ID Knowledge 등록 실패",
            detail: didText,
            githubUrl: rawUrl,
          }),
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
        message: "세션 결과가 저장되었습니다.",
        githubUrl: rawUrl,
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "서버 처리 중 오류 발생",
        detail: err.message,
      }),
    };
  }
};

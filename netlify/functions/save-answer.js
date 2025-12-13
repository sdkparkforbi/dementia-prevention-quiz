const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const DID_API_KEY = process.env.DID_API_KEY;
    const KNOWLEDGE_ID = process.env.KNOWLEDGE_ID;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'jsggm03';
    const REPO_NAME = process.env.REPO_NAME || 'dementia-quiz-knowledge';

    const { userName, score, total, results, timestamp } = JSON.parse(event.body);

    const resultDetails = results.map((r, i) => 
        `문제${i+1}: ${r.question}\n선택: ${r.userAnswer}\n정답: ${r.correctAnswer}\n결과: ${r.isCorrect ? '정답' : '오답'}`
    ).join('\n\n');

    const knowledgeContent = `
치매예방 퀴즈 결과 기록
========================
이름: ${userName}
점수: ${score}/${total}점
정답률: ${Math.round(score/total*100)}%
일시: ${new Date(timestamp).toLocaleString('ko-KR')}

상세 결과:
${resultDetails}

분석:
${score === total ? `${userName}님은 치매예방에 대해 매우 잘 알고 계십니다!` : 
  score >= total/2 ? `${userName}님은 치매예방 지식이 양호합니다. 틀린 부분을 복습해보세요.` :
  `${userName}님은 치매예방에 대해 더 학습이 필요합니다. 해설을 잘 읽어보세요.`}
`.trim();

    const fileName = `quiz_${userName}_${Date.now()}.txt`;
    const fileContentBase64 = Buffer.from(knowledgeContent, 'utf-8').toString('base64');

    const githubResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${fileName}`,
        {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Add quiz result from ${userName}`,
                content: fileContentBase64
            })
        }
    );

    if (!githubResponse.ok) {
        const errorText = await githubResponse.text();
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'GitHub 저장 실패', detail: errorText })
        };
    }

    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${REPO_NAME}/main/${fileName}`;

    const documentData = {
        documentType: 'text',
        source_url: rawUrl,
        title: `${userName}_퀴즈결과_${Date.now()}`
    };

    const didResponse = await fetch(
        `https://api.d-id.com/knowledge/${KNOWLEDGE_ID}/documents`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${DID_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(documentData)
        }
    );

    if (!didResponse.ok) {
        const errorText = await didResponse.text();
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'D-ID Knowledge 등록 실패', 
                detail: errorText,
                githubUrl: rawUrl 
            })
        };
    }

    const document = await didResponse.json();

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '답변이 저장되고 아바타가 학습했습니다',
            documentId: document.id,
            githubUrl: rawUrl
        })
    };
};

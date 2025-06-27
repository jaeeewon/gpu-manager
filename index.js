import express from 'express';
import { exec } from 'child_process';
import axios from 'axios';
import env from "dotenv";
env.config();

const app = express();
const PORT = 3001;

const ignorePaths = ['/favicon.ico']

let { pw, uuid, toUuid, userToken, from, to } = process.env;
from = +from
to = +to

const html =
    `<head>
    <title>LangAI GPU 복구</title>
</head>

<h1>wakeup 4090 😭</h1>
<h4>GPU가 어떤 이유에선지 자꾸 죽는데,, 매번 제가 살릴 수 없어서 만들었습니다</h4>

<label for="instance">인스턴스를 선택하세요</label>
<select onchange="clearVisibles()" id="instance">
    ${Array.from(new Array(to - from + 1), (_, i) => `<option value="${from + i}">hufs0${from + i}</option>`).join('\n')}
</select>

<button onclick="getGpuStatus()">GPU 상태 불러오기</button>
<button style="display: none;" id="reset" onclick="resetInstance()">인스턴스 재시작(문제 해결하기)</button>

<pre id="output" style="margin-top: 20px; padding: 10px;"></pre>

<script>
    const pre = document.getElementById('output')
    const reset = document.getElementById('reset')
    let PASSWORD = '';

    function pwAssertion() {
        while (PASSWORD.length !== 4) PASSWORD = prompt(PASSWORD === 'unauth' ? '비밀번호 오류! 다시 입력' : '비밀번호 입력')
    }

    function setStatus(stdout) {
        const isOk = !stdout.includes('Failed to initialize NVML: Unknown Error')
        pre.textContent = stdout;
        pre.style.color = isOk ? 'green' : 'red'
        reset.style.display = isOk ? 'none' : ''
    }

    function clearVisibles() {
        pre.textContent = '';
        reset.style.display = 'none'
    }

    async function getGpuStatus() {
        clearVisibles()
        pwAssertion()
        const no = document.getElementById('instance').value;
        const res = await fetch(\`./get-gpu-status?no=\${no}&pass=\${PASSWORD}\`);

        if (res.status === 401) {
            PASSWORD = 'unauth';
            return await getGpuStatus()
        }

        const json = await res.json();
        setStatus(json.success ? json.data.stdout : 'Error: ' + json.message);
    }

    async function resetInstance() {
        clearVisibles()
        pwAssertion()
        const no = document.getElementById('instance').value;
        const res = await fetch(\`./reset-instance?no=\${no}&pass=\${PASSWORD}\`, { method: 'POST' });

        if (res.status === 401) {
            PASSWORD = 'unauth';
            return await resetInstance()
        }

        const json = await res.json();
        setStatus(json.success ? json.data.stdout : 'Error: ' + json.message);
    }
</script>`

/**
 * stderr·비정상 종료 코드가 있어도 reject 하지 않는 exec 래퍼
 * @param {string} cmd 실행할 셸 명령
 * @param {object} [opts] exec 옵션
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function execSafe(cmd, opts = {}) {
    return new Promise((resolve) => {
        exec(cmd, opts, (error, stdout, stderr) => {
            // error가 존재해도 reject 대신 resolve
            const exitCode = error?.code ?? 0;        // 비정상 종료면 code가 존재
            resolve({ stdout, stderr, exitCode });
        });
    });
}

function instanceNumberAssertion(num) {
    if (typeof num !== 'number') throw new Error('only numbers are acceptable!')
    if (num < +from || num > +to) throw new Error('top-server only has 1-4 instance')
}

async function getGpuStatus(num) {
    instanceNumberAssertion(num)

    const command = `docker exec hufs0${num} nvidia-smi`
    const { stdout } = await execSafe(command);

    return stdout
}

async function resetInstance(num) {
    instanceNumberAssertion(num)

    let command = `docker restart hufs0${num}`
    await execSafe(command);

    return await getGpuStatus(num)
}

app.get('/', (_req, res) =>
    res.send(html)
)

app.use(async (req, res, next) => {
    if (req.query.pass !== pw) {
        if (!ignorePaths.includes(req.path)) await doNoti({ title: `GPU 관리 프로그램에 부정 접근이 확인됨`, body: `IP: ${req.headers['x-real-ip']}\nPW: ${req.query.pass}` })
        return res.status(401).send('unauthorized request');
    }
    next()
})

app.get('/get-gpu-status', async (req, res) => {
    try {
        const { no } = req.query
        const stdout = await getGpuStatus(+no)
        await doNoti({ title: `${no}번 GPU의 상태를 확인함`, body: `IP: ${req.headers['x-real-ip']}\nstdout: ${stdout}` })
        res.json({ success: true, data: { stdout } })
    } catch (e) {
        res.status(500).json({ success: false, message: e.message })
    }
})

app.post('/reset-instance', async (req, res) => {
    try {
        const { no } = req.query
        const stdout = await resetInstance(+no)
        await doNoti({ title: `${no} 인스턴스를 리셋함`, body: `IP: ${req.headers['x-real-ip']}\nstdout: ${stdout}` })
        res.json({ success: true, data: { stdout } })
    } catch (e) {
        res.status(500).json({ success: false, message: e.message })
    }
})

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

function trim(str, max = 850) {
    if (typeof str !== 'string') return '';
    return str.length > max ? str.slice(0, max) : str;
}

export async function doNoti({ title, body, type = `SvrmgrLangAI`, openScreen = true }) {
    try {
        const data = {
            uuid,
            toUuid,
            userToken,
            type,
            noti: {
                notification: {
                    title,
                    body: trim(body),
                    android_channel_id: type
                },
                data: {
                    openScreen: openScreen + ""
                }
            }
        };
        const response = await axios({
            baseURL: `https://proxy.pleizz.com/v5`,
            timeout: 15001,
            validateStatus() {
                return true;
            },
            method: "POST",
            url: "/sendPushByUuid",
            data
        });
        if (response.status !== 200) {
            return console.error(`failed to push noti: ${response?.data?.message || response.statusText}`);
        }
    } catch (e) {
        console.error(`failed to doNoti(${title} | ${body}): ${e.message}`);
    }
}
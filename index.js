import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import axios from 'axios';
import env from "dotenv";
env.config();

const app = express();
const PORT = 3001;
const __dirname = path.resolve();

const ignorePaths = ['/favicon.ico']

const { pw, uuid, toUuid, userToken } = process.env;

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
    if (num < 1 || num > 4) throw new Error('top-server only has 1-4 instance')
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

app.get('/', (req, res) =>
    res.sendFile(path.join(__dirname, 'manager.html'))
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

function trim(str, max=850) {
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
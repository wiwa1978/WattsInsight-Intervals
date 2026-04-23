import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const nextApps = [
    {
        name: "web",
        expectedCwd: path.join(repoRoot, "apps/web"),
        lockFile: path.join(repoRoot, "apps/web/.next/dev/lock"),
    },
    {
        name: "admin",
        expectedCwd: path.join(repoRoot, "apps/admin"),
        lockFile: path.join(repoRoot, "apps/admin/.next/dev/lock"),
    },
];

const apiServer = {
    name: "api",
    expectedCwd: path.join(repoRoot, "apps/api"),
    port: 8787,
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function getProcessCwd(pid) {
    try {
        return fs.readlinkSync(`/proc/${pid}/cwd`);
    } catch {
        return null;
    }
}

function getProcessCommand(pid) {
    try {
        return execFileSync("ps", ["-wwp", String(pid), "-o", "args="], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return "";
    }
}

function listListeningPids(port) {
    try {
        const output = execFileSync("lsof", ["-t", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();

        return output
            .split(/\s+/)
            .filter(Boolean)
            .map((value) => Number.parseInt(value, 10))
            .filter((value) => Number.isInteger(value));
    } catch {
        return [];
    }
}

async function stopPid(pid, name) {
    if (!isPidRunning(pid)) {
        return;
    }

    process.kill(pid, "SIGTERM");

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        if (!isPidRunning(pid)) {
            console.log(`Stopped ${name} (pid ${pid})`);
            return;
        }

        await sleep(100);
    }

    process.kill(pid, "SIGKILL");
    await sleep(100);

    if (!isPidRunning(pid)) {
        console.log(`Force-stopped ${name} (pid ${pid})`);
    }
}

function getPidFromLockFile(lockFile) {
    try {
        const parsed = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        return Number.isInteger(parsed.pid) ? parsed.pid : null;
    } catch {
        return null;
    }
}

for (const app of nextApps) {
    const pid = getPidFromLockFile(app.lockFile);

    if (!pid) {
        continue;
    }

    if (getProcessCwd(pid) !== app.expectedCwd) {
        continue;
    }

    await stopPid(pid, app.name);
}

for (const pid of listListeningPids(apiServer.port)) {
    if (getProcessCwd(pid) !== apiServer.expectedCwd) {
        continue;
    }

    await stopPid(pid, apiServer.name);
}

const remainingPorts = [
    { name: "web", port: 3100 },
    { name: "admin", port: 3101 },
    { name: "api", port: 8787 },
];

const conflicts = remainingPorts.flatMap(({ name, port }) => {
    return listListeningPids(port).map((pid) => ({
        name,
        port,
        pid,
        cwd: getProcessCwd(pid),
        command: getProcessCommand(pid),
    }));
});

if (conflicts.length > 0) {
    console.error("Some fixed dev ports are still occupied:");
    for (const conflict of conflicts) {
        console.error(`- ${conflict.name} port ${conflict.port}: pid ${conflict.pid} cwd=${conflict.cwd ?? "unknown"}`);
        if (conflict.command) {
            console.error(`  command: ${conflict.command}`);
        }
    }
    process.exit(1);
}
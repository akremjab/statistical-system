const readline = require("node:readline");
const { stdin, stdout } = require("node:process");

async function main() {
    const rl = readline.createInterface({
        input: stdin,
        output: stdout,
    });

    const username = await new Promise((resolve) => {
        rl.question("اسم مستخدم تجريبي: ", resolve);
    });

    const fullName = await new Promise((resolve) => {
        rl.question("اسم كامل تجريبي: ", resolve);
    });

    rl.close();

    if (!stdin.isTTY || !stdout.isTTY) {
        throw new Error("يجب استخدام Terminal تفاعلي");
    }

    console.log("تم إدخال البيانات التجريبية.");
    stdout.write("كلمة تجريبية مخفية: ");

    let length = 0;

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();

    await new Promise((resolve, reject) => {
        function cleanup() {
            stdin.removeListener("keypress", onKeypress);
            stdin.setRawMode(false);
            stdin.pause();
            stdout.write("\n");
        }

        function onKeypress(str, key) {
            if (key?.ctrl && key.name === "c") {
                cleanup();
                reject(new Error("تم إلغاء الاختبار"));
            } else if (
                key?.name === "return" ||
                key?.name === "enter"
            ) {
                cleanup();
                resolve();
            } else if (key?.name === "backspace") {
                length = Math.max(0, length - 1);
            } else if (str && !key?.ctrl && !key?.meta) {
                length += [...str].length;
            }
        }

        stdin.on("keypress", onKeypress);
    });

    console.log("نجح اختبار الانتقال بين طريقتي الإدخال.");
    console.log("عدد أحرف الكلمة التجريبية:", length);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
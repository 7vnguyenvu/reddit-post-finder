const $ = (id) => document.getElementById(id);
const input = $("input-key-word");
const startBtn = $("start-get-urls");
const pauseBtn = $("pause-get-urls");
const resumeBtn = $("resume-get-urls");
const downPosts = $("down-posts");
const results = $("results");
const totalUrl = $("total-url");

function resetBtn() {
    pauseBtn.disabled = true;
    resumeBtn.disabled = true;
    downPosts.disabled = true;
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "none";
}
resetBtn();

let posts = [];

// /////////////////////////////////////////////
startBtn.addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    // Reset the current index and paused state
    pauseBtn.disabled = false;
    pauseBtn.style.display = "inline-block";
    resumeBtn.style.display = "none";

    // Flow
    // await fillInput("faceplate-search-input", input.value, activeTab);
    const amount = $("get-amount").value;
    await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
            window.isPaused = false;
        },
    });

    input.value = await getKeyInSearch(activeTab);
    const scroll = await autoScroll(activeTab, amount);
    if (scroll) {
        resetBtn();
        // Get Post URLs
        posts = await getRedditPosts(activeTab);
        if (posts.length) {
            downPosts.disabled = false;
            totalUrl.innerText = posts.length;
        }
    }
});

// Pause
pauseBtn.addEventListener("click", async () => {
    pauseBtn.disabled = true;
    resumeBtn.disabled = false;
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "inline-block";

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
            window.isPaused = true;
        },
    });
});

// Resume
resumeBtn.addEventListener("click", async () => {
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;
    pauseBtn.style.display = "inline-block";
    resumeBtn.style.display = "none";

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
            window.isPaused = false;
        },
    });
});

// downPosts
downPosts.addEventListener("click", async () => {
    if (!posts.length) {
        return;
    }

    await downCSV(posts);
});

/////////////////////////////////////////////////////////////////////////
async function getKeyInSearch(activeTab) {
    const result = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
            const searchInpput = document.querySelector("faceplate-search-input");
            const input = searchInpput.shadowRoot.querySelector("input");
            return input.value;
        },
    });

    // Trả về kết quả từ executeScript
    return result[0].result;
}

async function downCSV(posts) {
    if (!input.value.trim()) {
        input.focus();
        return;
    }

    // Tạo nội dung CSV
    let csvContent = `KEY:,${input.value}\n`;
    csvContent += "#,URL,SEARCH_KEY_TITLE,MORE\n";
    posts.forEach((post, index) => {
        csvContent += `${index + 1},"${post}","${post.split("/comments")[1]}"\r\n`;
    });

    // Tạo blob và download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `[reddit_posts]_${posts.length}__${encodeURI(input.value).replace("%20", "+")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function autoScroll(activeTab, amount, delay = 1) {
    return new Promise(async (resolve) => {
        await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: async (delay, amount) => {
                return new Promise(async (innerResolve) => {
                    if (typeof window.isPaused === "undefined") {
                        window.isPaused = false;
                    }

                    window.currentTimeout = null;

                    // Hàm lấy các bài viết Reddit
                    const getRedditPosts = () => {
                        const links = Array.from(document.querySelectorAll('a[data-testid="post-title"]'));
                        return links.map((link) => link.href).filter((href) => href.includes("/comments/"));
                    };

                    // Hàm kiểm tra số lượng bài viết
                    const checkPosts = async () => {
                        const posts = getRedditPosts();
                        // console.log("Current posts:", posts.length);

                        if (posts.length >= amount) {
                            console.log("Enough quantity to download, stopping scroll");
                            window.isPaused = true;
                            clearTimeout(window.currentTimeout);
                            innerResolve(true); // Resolve khi có đủ số lượng
                        }
                    };

                    // Cuộn liên tục với khoảng thời gian delay
                    const scrollInterval = setInterval(async () => {
                        if (window.isPaused) {
                            console.log("Stopped!!");
                            clearInterval(scrollInterval); // Tạm dừng cuộn
                            innerResolve(true); // Resolve khi scroll kết thúc
                        }
                        window.scrollBy(0, 100);

                        await checkPosts(); // Kiểm tra số lượng bài viết
                    }, delay);

                    // Bắt sự kiện scroll và kiểm tra khi đến cuối trang
                    window.addEventListener("scroll", () => {
                        if (window.isPaused) return;

                        const currentScrollPosition = window.scrollY + window.innerHeight;
                        const totalScrollHeight = document.documentElement.scrollHeight;

                        // Khi đến cuối trang
                        if (currentScrollPosition >= totalScrollHeight) {
                            console.log("Reached the bottom. Waiting for new content...");

                            // Clear timeout cũ nếu có
                            if (window.currentTimeout) {
                                clearTimeout(window.currentTimeout);
                            }

                            // Lưu reference của timeout mới
                            window.currentTimeout = setTimeout(() => {
                                // Lấy lại vị trí scroll hiện tại để so sánh
                                const newScrollPosition = window.scrollY + window.innerHeight;
                                const newTotalHeight = document.documentElement.scrollHeight;

                                if (newScrollPosition >= newTotalHeight) {
                                    console.log("No new content detected after 5s, stopping scroll");
                                    window.isPaused = true;
                                    innerResolve(true); // Dừng nếu không có nội dung mới
                                } else {
                                    console.log("New content detected, continuing scroll");
                                    clearTimeout(window.currentTimeout);
                                    window.currentTimeout = null;
                                }
                            }, 5000);
                        }
                    });
                    // Kiểm tra bài viết ban đầu
                    await checkPosts();
                });
            },
            args: [delay, amount],
        });
        resolve(true);
    });
}

async function getRedditPosts(activeTab) {
    const result = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
            // Tìm tất cả các thẻ <a>
            return Array.from(document.querySelectorAll('a[data-testid="post-title"]'))
                .map((link) => link.href)
                .filter((href) => href.includes("/comments/")); // Lọc ra các link có dạng "/comments/"
        },
    });

    // Trả về kết quả từ executeScript
    return result[0].result;
}

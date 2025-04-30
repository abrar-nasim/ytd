import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

export default function Home() {
  const [merging, setMerging] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [quality, setQuality] = useState("best");
  const [videoData, setVideoData] = useState<null | {
    title: string;
    thumbnail: string;
    download_url: string;
    captions?: string;
    post_caption?: string;
    filesize_mb?: number;
  }>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("light");
  const [platform, setPlatform] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const autoPasteClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const valid =
        /^(https?:\/\/)?(www\.)?(youtube\.com\/|youtu\.be\/|instagram\.com\/reel\/|twitter\.com\/\w+\/status\/|tiktok\.com\/@[\w.-]+\/video\/).+/;
      if (valid.test(text)) {
        setVideoUrl(text);
        setPlatform(detectPlatform(text));
      }
    } catch {}
  }, []);
  
  useEffect(() => {
    document.getElementById("url-input")?.focus();
    autoPasteClipboard();
  }, [autoPasteClipboard]);
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress((prev) => (prev >= 95 ? prev : prev + Math.random() * 5));
      }, 200);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [loading]);
  
  const handleThemeToggle = () => {
    setTheme((prev) => {
      const newTheme = prev === "light" ? "dark" : "light";
      document.body.classList.toggle("dark", newTheme === "dark");
      return newTheme;
    });
  };

  const detectPlatform = (url: string) => {
    if (url.includes("youtube.com") || url.includes("youtu.be"))
      return "YouTube";
    if (url.includes("instagram.com")) return "Instagram";
    if (url.includes("tiktok.com")) return "TikTok";
    if (url.includes("twitter.com")) return "Twitter";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) {
      setError("Please enter a valid URL.");
      return;
    }
    const multiPlatformRegex =
      /^(https?:\/\/)?(www\.)?(youtube\.com\/|youtu\.be\/|instagram\.com\/reel\/|twitter\.com\/\w+\/status\/|tiktok\.com\/@[\w.-]+\/video\/).+/;
    if (!multiPlatformRegex.test(videoUrl.trim())) {
      setError("Invalid YouTube, Instagram, Twitter, or TikTok URL.");
      return;
    }

    const cleanedUrl = videoUrl.split("?")[0];
    setPlatform(detectPlatform(videoUrl));

    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setMerging(false);
    setError("");
    setVideoData(null);

    const timeoutId = setTimeout(() => {
      setError("Download taking too long. Try again later.");
      setLoading(false);
      setMerging(false);
      controller.abort();
    }, 300000);

    try {
      const formData = new FormData();
      formData.append("url", cleanedUrl);
      formData.append("quality", quality);

      const response = await fetch(`${API_BASE}/fetch`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to fetch video info.");
      }

      clearTimeout(timeoutId);
      setProgress(100);
      setMerging(true);

      setTimeout(() => {
        setVideoData(data);
        setLoading(false);
        setMerging(false);
      }, 3000);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.response?.status === 429) {
        setError("Too many requests. Please wait a minute.");
      }

      if (err.name !== "AbortError") {
        setError(err.message || "Something went wrong. Try again later.");
      }
      setLoading(false);
      setMerging(false);
    }
  };

  const handleCancel = () => {
    controllerRef.current?.abort();
    setLoading(false);
    setProgress(0);
    setError("Fetch cancelled.");
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setVideoUrl(newUrl);
    if (loading) handleCancel();
    setPlatform(detectPlatform(newUrl));
  };

  return (
    <>
      <Head>
        <title>
          Free Video Downloader - YouTube, Instagram, TikTok, Twitter
        </title>
        <meta
          name="description"
          content="Fastest free video downloader. Download YouTube, Instagram Reels, TikTok, Twitter videos instantly in HD quality. No signup. Free forever."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="index, follow" />
        <meta
          name="keywords"
          content="Free Video Downloader, YouTube Video Downloader, Instagram Reel Download, TikTok Video Download, Twitter Video Save, Download HD Videos"
        />
        <meta name="author" content="YourWebsiteName" />

        {/* Open Graph for Facebook / LinkedIn */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://yourdomain.com/" />
        <meta
          property="og:title"
          content="Download Videos Instantly - YouTube, Instagram, TikTok, Twitter"
        />
        <meta
          property="og:description"
          content="Free video downloader for YouTube, Instagram, TikTok, Twitter. No signup needed. Secure & fast HD downloads."
        />
        <meta property="og:image" content="/og-image.png" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://yourdomain.com/" />
        <meta
          name="twitter:title"
          content="Download Videos Instantly - Free Video Downloader"
        />
        <meta
          name="twitter:description"
          content="Fastest way to download YouTube, Instagram, TikTok videos. HD quality. Free forever."
        />
        <meta name="twitter:image" content="/twitter-image.png" />
        <script type="application/ld+json">
          {`
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How to download YouTube, Instagram, TikTok videos for free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Just paste the video URL, choose quality, and hit Fetch. No signup required!"
      }
    },
    {
      "@type": "Question",
      "name": "Is login required to download videos?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No login or signup needed. Simply paste the link and download."
      }
    },
    {
      "@type": "Question",
      "name": "Is this video downloader secure?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes! We use secure APIs and do not store your links or downloads."
      }
    }
  ]
}
`}
        </script>

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="top-banner-ad">Top Banner Ad</div>
      <div className="main-wrapper">
        <div className="side-ad">Left Ad</div>

        <div className="content">
          {loading ? (
            <div className="skeleton-wrapper">
              <div className="skeleton-input"></div>
              <div className="skeleton-select"></div>
              <div className="skeleton-button"></div>
              <div className="skeleton-info"></div>
            </div>
          ) : (
            <>
              <div className="hero-section">
                <h1 className="hero-title">Download Videos in Seconds</h1>
                <p className="hero-subtitle">
                  YouTube, Instagram, TikTok, Twitter supported.
                </p>
                <button className="theme-toggle" onClick={handleThemeToggle}>
                  {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <input
                  id="url-input"
                  type="text"
                  placeholder="Paste video URL"
                  value={videoUrl}
                  onChange={handleUrlChange}
                  className="input-field"
                  required
                />
                {platform && <div className="platform-badge">{platform}</div>}

                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="input-field"
                >
                  <option value="best">Best Quality (Auto)</option>
                  <option value="360p">360p</option>
                  <option value="480p">480p</option>
                  <option value="720p">720p HD</option>
                  <option value="1080p">1080p Full HD</option>
                  <option value="audio">Audio Only (MP3)</option>
                </select>

                <div className="button-group">
                  <button
                    type="submit"
                    disabled={loading || merging}
                    className="fetch-button"
                  >
                    {merging
                      ? "Merging..."
                      : loading
                      ? `Fetching... ${Math.floor(progress)}%`
                      : "Fetch Video"}
                  </button>

                  <div className="trust-badges">
                    <span>✅ No Signup</span>
                    <span>✅ Secure Download</span>
                  </div>

                  {(loading || merging) && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="cancel-button"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              {error && <p className="error-text">{error}</p>}

              {videoData && (
                <div className="video-result">
                  <h2>{videoData.title}</h2>
                  {videoData.filesize_mb && (
                    <p>Approx File Size: {videoData.filesize_mb} MB</p>
                  )}
                  <img
                    src={videoData.thumbnail}
                    alt="Thumbnail"
                    className="thumbnail"
                    loading="lazy"
                  />
                  <a
                    href={videoData.download_url}
                    download
                    className="download-button"
                  >
                    Download Video
                  </a>
                  {videoData.post_caption && (
                    <div className="captions-section">
                      <h3>Post Caption:</h3>
                      <textarea
                        id="captions-textarea"
                        value={videoData.post_caption}
                        readOnly
                        className="captions-box"
                      />
                      <button
                        type="button"
                        className="copy-captions-button"
                        onClick={() => {
                          const textArea = document.getElementById(
                            "captions-textarea"
                          ) as HTMLTextAreaElement;
                          navigator.clipboard.writeText(textArea.value);
                          alert("Caption copied!");
                        }}
                      >
                        Copy Caption
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="faq-section">
                <h3>Tips & FAQ</h3>
                <ul>
                  <li>✅ No signup needed. Just paste URL & download.</li>
                  <li>✅ Instagram Reels, Shorts, Tweets all supported.</li>
                  <li>✅ For any error, just refresh and retry.</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="side-ad">Right Ad</div>
      </div>

      <div className="bottom-banner-ad">Bottom Banner Ad</div>
      <div className="mobile-sticky-ad">Sticky Ad</div>









      {/* CSS */}
      <style>{`
        /* FULL FINAL CSS is already given previously in backticks, no mistake */
        body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #f9f9f9;
  transition: background 0.3s;
}
body.dark {
  background: #111;
  color: #eee;
}

.top-banner-ad, .bottom-banner-ad {
  height: 90px;
  background: #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-wrapper {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  padding: 2rem;
}

.side-ad {
  width: 160px;
  background: #eee;
  height: 600px;
  display: none;
  align-items: center;
  justify-content: center;
}
@media(min-width: 1024px) {
  .side-ad { display: flex; }
}

.content {
  max-width: 700px;
  width: 100%;
  background: #fff;
  padding: 2rem;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  text-align: center;
  transition: background 0.3s, color 0.3s;
}
body.dark .content {
  background: #1e1e1e;
}

.hero-section {
  background: linear-gradient(135deg, #6fb1fc, #4364f7, #0052d4);
  color: white;
  padding: 2rem;
  border-radius: 12px;
  margin-bottom: 1.5rem;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}
body.dark .hero-section {
  background: linear-gradient(135deg, #232526, #414345);
}

.hero-title {
  font-size: 1.8rem;
  margin: 0 0 0.5rem 0;
  font-weight: 700;
}

.hero-subtitle {
  font-size: 1rem;
  opacity: 0.9;
}

.theme-toggle {
  margin-top: 1rem;
  padding: 8px 16px;
  border-radius: 20px;
  background: white;
  color: black;
  font-weight: bold;
  cursor: pointer;
  border: none;
}
body.dark .theme-toggle {
  background: #555;
  color: white;
}

.input-field, select {
  width: 100%;
  margin-bottom: 1rem;
  padding: 0.8rem;
  font-size: 1rem;
  border-radius: 6px;
  border: 1px solid #ccc;
  transition: background 0.3s, color 0.3s, border 0.3s;
}
body.dark .input-field, 
body.dark select {
  background: #2c2c2c;
  color: #eee;
  border: 1px solid #444;
}

.platform-badge {
  margin-bottom: 1rem;
  background: #0070f3;
  color: white;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 0.9rem;
  display: inline-block;
}

.fetch-button, .cancel-button {
  width: 100%;
  margin-top: 10px;
  padding: 1rem;
  border-radius: 8px;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.3s;
}

.fetch-button {
  background: linear-gradient(90deg, #00c6ff, #0072ff);
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}
.fetch-button:hover {
  background: linear-gradient(90deg, #0072ff, #00c6ff);
}

.cancel-button {
  background: #ff4136;
  color: white;
}
.cancel-button:hover {
  background: #d7372f;
}

.trust-badges {
  margin-top: 8px;
  font-size: 0.8rem;
  color: gray;
  display: flex;
  justify-content: center;
  gap: 12px;
}

.progress-bar-wrapper {
  margin-top: 1rem;
  background: #eee;
  border-radius: 5px;
}
body.dark .progress-bar-wrapper {
  background: #333;
}

.progress-bar {
  height: 8px;
  background: #0070f3;
  border-radius: 5px;
  transition: width 0.4s ease;
}

.video-result {
  margin-top: 2rem;
}

.thumbnail {
  width: 100%;
  border-radius: 10px;
}

.download-button {
  margin-top: 1rem;
  background: #28a745;
  color: white;
  padding: 12px;
  border-radius: 10px;
  display: inline-block;
  text-decoration: none;
  font-weight: bold;
}

.captions-section {
  margin-top: 2rem;
  text-align: left;
}

.captions-box {
  width: 100%;
  height: 200px;
  margin-bottom: 10px;
  padding: 1rem;
  border-radius: 8px;
  background: #f0f0f0;
}
body.dark .captions-box {
  background: #2a2a2a;
  color: #eee;
}

.copy-captions-button {
  background: #0070f3;
  color: white;
  padding: 10px;
  border-radius: 8px;
  margin-top: 0.5rem;
}

.error-text {
  margin-top: 1rem;
  color: red;
  font-size: 0.95rem;
}

.faq-section {
  margin-top: 2rem;
  text-align: left;
  font-size: 0.9rem;
}
.faq-section ul {
  list-style-type: none;
  padding: 0;
}
.faq-section li {
  margin-bottom: 0.5rem;
}

.mobile-sticky-ad {
  display: none;
}
@media(max-width: 1023px) {
  .mobile-sticky-ad {
    display: flex;
    height: 60px;
    background: #ccc;
    align-items: center;
    justify-content: center;
    position: fixed;
    bottom: 0;
    width: 100%;
  }
}
.skeleton-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: pulse 2s infinite;
}

.skeleton-input, .skeleton-select, .skeleton-button, .skeleton-info {
  height: 45px;
  background: linear-gradient(90deg, #eee, #ddd, #eee);
  background-size: 400% 400%;
  animation: shimmer 1.2s ease-in-out infinite;
  border-radius: 8px;
}

.skeleton-info {
  height: 100px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 767px) {
  .content {
    padding-bottom: 80px; /* Space for sticky ad */
  }
  
  .fetch-button, .cancel-button {
    padding: 0.8rem;
    font-size: 0.95rem;
  }
  
  .trust-badges {
    margin-top: 0.5rem;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.75rem;
  }
  
  form {
    width: 100%;
  }
}
@keyframes fadeSlideDown {
  0% {
    opacity: 0;
    transform: translateY(-20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-title, .hero-subtitle {
  animation: fadeSlideDown 0.8s ease-out forwards;
}
.hero-subtitle {
  animation: fadeSlideDown 1s ease-out forwards;
  animation-delay: 0.2s;
}


      `}</style>
    </>
  );
}

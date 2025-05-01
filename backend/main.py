# main.py
from fastapi import FastAPI, HTTPException, Form, Request
from fastapi.responses import JSONResponse, FileResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from yt_dlp.utils import DownloadError
import yt_dlp
import subprocess
import os
import re
import time
import random
import string
import asyncio
import requests
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
load_dotenv()


app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

if not os.path.exists("downloads"):
    os.makedirs("downloads")

def sanitize_filename(name: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', name)

def random_suffix(length=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return PlainTextResponse("Too many requests, slow down.", status_code=429)

@app.get("/")
async def root():
    return {"message": "YTD Backend is running!"}

@app.post("/fetch")
@limiter.limit("10/minute")
async def fetch_video(request: Request, url: str = Form(...), quality: str = Form("best")):
    if not url.strip():
        raise HTTPException(status_code=422, detail="No URL provided.")

    TIMEOUT_LIMIT = 300

    try:
        with yt_dlp.YoutubeDL({'quiet': True, 'noplaylist': True}) as ydl:
            info = ydl.extract_info(url, download=False)

        if not info:
            raise HTTPException(status_code=404, detail="Video not found.")

        title = info.get('title') or "video"
        post_caption = info.get('description', "")
        thumbnail = info.get('thumbnail')

        safe_title = sanitize_filename(title)[:50]
        suffix = random_suffix()
        base_filename = f"{safe_title}_{suffix}"
        output_path = f"downloads/{base_filename}.mp4"

        format_preference = {
            "360p": "best[height<=360]",
            "480p": "best[height<=480]",
            "720p": "best[height<=720]",
            "1080p": "best[height<=1080]",
            "audio": "bestaudio",
            "best": "best"
        }
        selected_format = format_preference.get(quality, "best")

        download_opts = {
            'quiet': True,
            'outtmpl': output_path,
            'format': selected_format,
            'noplaylist': True,
            'concurrent_fragment_downloads': 3,
        }

        loop = asyncio.get_event_loop()
        download_task = loop.run_in_executor(None, lambda: yt_dlp.YoutubeDL(download_opts).download([url]))

        start_time = time.time()
        while not download_task.done():
            if await request.is_disconnected():
                raise HTTPException(status_code=499, detail="Client disconnected.")
            if time.time() - start_time > TIMEOUT_LIMIT:
                raise HTTPException(status_code=504, detail="Download timed out.")
            await asyncio.sleep(1)

        if download_task.exception():
            raise download_task.exception()

        if not thumbnail:
            thumbnail_path = f"downloads/{base_filename}_thumbnail.jpg"
            ffmpeg_cmd = [
                "ffmpeg", "-y", "-i", output_path,
                "-ss", "00:00:01.000", "-vframes", "1",
                thumbnail_path
            ]
            proc = await asyncio.create_subprocess_exec(*ffmpeg_cmd)
            await proc.communicate()
            if os.path.exists(thumbnail_path):
                # thumbnail = f"http://127.0.0.1:8000/download/{base_filename}_thumbnail.jpg"
                thumbnail = f"{os.getenv('BASE_URL', 'http://127.0.0.1:8000')}/download/{base_filename}_thumbnail.jpg"


        captions_text = None
        subtitles = info.get('subtitles') or {}
        if subtitles:
            lang = 'en' if 'en' in subtitles else list(subtitles.keys())[0]
            subtitle_entries = subtitles[lang]
            if subtitle_entries:
                subtitle_url = subtitle_entries[0]['url']
                try:
                    response = requests.get(subtitle_url)
                    if response.status_code == 200:
                        captions_text = response.text
                except Exception as e:
                    print("Subtitle fetch error:", e)

        # ✅ Fetch approximate file size (in MB)
        filesize_bytes = info.get('filesize') or info.get('filesize_approx')
        filesize_mb = round(filesize_bytes / (1024 * 1024), 2) if filesize_bytes else None

        # video_download_url = f"http://127.0.0.1:8000/download/{base_filename}.mp4"
        # video_download_url = f"{os.getenv('BASE_URL', 'http://127.0.0.1:8000')}/download/{base_filename}.mp4"

        # Inside your route
        base_url = str(request.base_url).rstrip("/")  # Gets the live domain like Railway
        video["download_url"] = f"{base_url}/download/{filename}"



        return JSONResponse(content={
            "title": title,
            "thumbnail": thumbnail,
            "download_url": video_download_url,
            "captions": captions_text,
            "post_caption": post_caption,
            "filesize_mb": filesize_mb,    # ✅ Added here
        })

    except DownloadError as de:
        error_message = str(de)
        raise HTTPException(status_code=400, detail="Download error: " + error_message)

    except Exception as e:
        print("Server error:", e)
        raise HTTPException(status_code=500, detail="Server error. Try again later.")

@app.get("/download/{filename}")
async def download_file(filename: str):
    file_path = f"downloads/{filename}"
    if os.path.exists(file_path):
        return FileResponse(path=file_path, filename=filename, media_type='application/octet-stream')
    else:
        raise HTTPException(status_code=404, detail="File not found.")

def cleanup_old_files():
    now = time.time()
    cutoff = now - 2 * 3600
    for filename in os.listdir("downloads"):
        file_path = os.path.join("downloads", filename)
        if os.path.isfile(file_path) and os.path.getmtime(file_path) < cutoff:
            os.remove(file_path)

scheduler = BackgroundScheduler()
# scheduler.add_job(cleanup_old_files, 'interval', hours=6)
scheduler.add_job(cleanup_old_files, 'interval', minutes=30)  # runs every 30 min

scheduler.start()



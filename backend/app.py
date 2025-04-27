from fastapi import FastAPI, HTTPException, Form, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from yt_dlp.utils import DownloadError
import yt_dlp  # ✅ <-- ADD THIS LINE
import subprocess
import os
import re
import time
import random
import string
import asyncio


app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create downloads folder if missing
if not os.path.exists("downloads"):
    os.makedirs("downloads")

# Helper to sanitize filenames
def sanitize_filename(name: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', name)

# Helper to generate random suffix
def random_suffix(length=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

@app.get("/")
async def root():
    return {"message": "YTD Backend is running!"}

@app.post("/fetch")
async def fetch_video(request: Request, url: str = Form(...), quality: str = Form("best")):
    yt_dlp_proc = None
    ffmpeg_proc = None
    TIMEOUT_LIMIT = 300  # 5 minutes

    try:
        # Step 1: Extract metadata
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)

        title = info.get('title') or "video"
        thumbnail = info.get('thumbnail')

        safe_title = sanitize_filename(title)[:50]
        suffix = random_suffix()
        base_filename = f"{safe_title}_{suffix}"
        output_path = f"downloads/{base_filename}.mp4"

        # Step 2: Choose format
        format_map = {
            "360p": "bestvideo[height<=360]+bestaudio/best[height<=360]",
            "480p": "bestvideo[height<=480]+bestaudio/best[height<=480]",
            "720p": "bestvideo[height<=720]+bestaudio/best[height<=720]",
            "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            "best": "bestvideo+bestaudio/best"
        }
        selected_format = format_map.get(quality, "bestvideo+bestaudio/best")

        # Step 3: Download
        ydl_opts = {
            'quiet': True,
            'outtmpl': output_path,
            'format': selected_format,
            'merge_output_format': 'mp4',
            'postprocessors': [
                {
                    'key': 'FFmpegVideoConvertor',
                    'preferedformat': 'mp4',
                }
            ],
            'noplaylist': True,
            'concurrent_fragment_downloads': 3,
            'postprocessor_args': ['-y'],
        }

        loop = asyncio.get_event_loop()
        download_task = loop.run_in_executor(None, lambda: yt_dlp.YoutubeDL(ydl_opts).download([url]))

        start_time = time.time()

        while not download_task.done():
            if await request.is_disconnected():
                raise HTTPException(status_code=499, detail="Client disconnected during download")
            if time.time() - start_time > TIMEOUT_LIMIT:
                raise HTTPException(status_code=504, detail="Download timed out")
            await asyncio.sleep(1)

        if download_task.exception():
            raise download_task.exception()

        # Step 4: Re-encode using ffmpeg
        fixed_output_path = output_path.replace(".mp4", "_fixed.mp4")

        ffmpeg_cmd = [
            "ffmpeg", "-y", "-i", output_path,
            "-c:v", "libx264", "-c:a", "aac",
            "-strict", "experimental",
            "-b:a", "192k",
            "-preset", "fast",
            fixed_output_path
        ]
        ffmpeg_proc = await asyncio.create_subprocess_exec(*ffmpeg_cmd)
        ffmpeg_start_time = time.time()

        while await ffmpeg_proc.wait() is None:
            if await request.is_disconnected():
                ffmpeg_proc.terminate()
                raise HTTPException(status_code=499, detail="Client disconnected during re-encode")
            if time.time() - ffmpeg_start_time > TIMEOUT_LIMIT:
                ffmpeg_proc.terminate()
                raise HTTPException(status_code=504, detail="Encoding timed out")
            await asyncio.sleep(1)

        os.remove(output_path)
        os.rename(fixed_output_path, output_path)

        video_download_url = f"http://127.0.0.1:8000/download/{base_filename}.mp4"

        return JSONResponse(content={
            "title": title,
            "thumbnail": thumbnail,
            "download_url": video_download_url
        })

    except DownloadError as de:
        error_message = str(de)

        if "Private video" in error_message or "This video is private" in error_message:
            raise HTTPException(status_code=400, detail="This video is private or restricted. Cannot download.")
        elif "Video unavailable" in error_message or "removed by the user" in error_message:
            raise HTTPException(status_code=404, detail="This video has been removed or is not available.")
        elif "URL could be invalid" in error_message or "Unsupported URL" in error_message:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL. Please check and try again.")
        else:
            raise HTTPException(status_code=400, detail="Unable to download video. It might be restricted.")

    except Exception as e:
        raise HTTPException(status_code=500, detail="Server error. Please try again later.")

@app.get("/download/{filename}")
async def download_file(filename: str):
    file_path = f"downloads/{filename}"
    if os.path.exists(file_path):
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type='application/octet-stream'
        )
    else:
        raise HTTPException(status_code=404, detail="File not found")

# Old file cleanup
def cleanup_old_files():
    now = time.time()
    cutoff = now - 24*3600  # 24 hours

    files = os.listdir("downloads")
    for filename in files:
        file_path = os.path.join("downloads", filename)
        if os.path.isfile(file_path):
            if os.path.getmtime(file_path) < cutoff:
                os.remove(file_path)
                print(f"Deleted old file: {filename}")

# Schedule cleaner
scheduler = BackgroundScheduler()
scheduler.add_job(cleanup_old_files, 'interval', hours=6)
scheduler.start()

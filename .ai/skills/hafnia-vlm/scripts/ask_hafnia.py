"""
ask_hafnia.py - ask Hafnia VLM about the last seconds of one camera, through the Hafnia gateway on this machine.

Run it on the machine; the gateway is not reachable from your laptop. Install Python 3.11 or later from python.org
(it adds the py command; no extra packages are needed). Each completed run costs 1 of your 500 requests a day.

    py ask_hafnia.py --camera (Read-Host 'Camera ID') --prompt "Describe what happens in this video."
    py ask_hafnia.py --camera (Read-Host 'Camera ID') --prompt-title "Vandalism check" --seconds 20

--prompt-title sends a saved prompt, so gateway rules for that prompt check the answer.
The password is the gateway's administrator password, which is your Windows password. The script asks for it;
set the environment variable HAFNIA_GW_PASSWORD to skip the question.
Camera IDs, in PowerShell: Connect-Vms -ServerAddress 'http://localhost' -AcceptEula; Get-VmsCamera | Select-Object Name, Id
"""
import argparse
import datetime
import getpass
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

GATEWAY = "https://localhost:15443"

ctx = ssl.create_default_context()
ctx.check_hostname = False       # certificate checks off for this client:
ctx.verify_mode = ssl.CERT_NONE  # use it only for the gateway, whose certificate is self-signed


def call(method, path, body=None, session=None):
    req = urllib.request.Request(GATEWAY + path, method=method,
                                 data=None if body is None else json.dumps(body).encode("utf-8"))
    req.add_header("Content-Type", "application/json")
    if session:
        req.add_header("X-Session-Id", session)
    with urllib.request.urlopen(req, context=ctx, timeout=60) as response:
        text = response.read().decode("utf-8")
        return json.loads(text) if text else None


parser = argparse.ArgumentParser(description="Ask Hafnia VLM about the last seconds of one camera.")
parser.add_argument("--camera", required=True, help="the camera's id")
what = parser.add_mutually_exclusive_group(required=True)
what.add_argument("--prompt", help="the prompt text")
what.add_argument("--prompt-title", help="the title of a saved prompt")
parser.add_argument("--seconds", type=int, default=30, help="clip length in seconds, ending 5 seconds ago (default 30)")
parser.add_argument("--user", default="administrator", help="gateway user (default administrator)")
args = parser.parse_args()
if args.seconds < 1:
    parser.error("--seconds must be 1 or more")

password = os.environ.get("HAFNIA_GW_PASSWORD") or getpass.getpass(f"Gateway password for {args.user}: ")

try:
    session = call("POST", "/api/Sessions/Login", {"Name": args.user, "Password": password})["Id"]
    print("Logged in to the gateway")

    if args.prompt_title:
        found = call("GET", "/api/Prompts?SearchString=" + urllib.parse.quote(args.prompt_title), session=session)
        prompt = next((p for p in found["PageContent"] if p["Title"] == args.prompt_title), None)
        if not prompt:
            sys.exit(f"No saved prompt titled '{args.prompt_title}'")
        request = {"PromptId": prompt["Id"], "Prompt": prompt["Text"]}
        print(f"Prompt: {prompt['Title']}")
    else:
        request = {"Prompt": args.prompt}

    end = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=5)
    start = end - datetime.timedelta(seconds=args.seconds)
    request["VideoUris"] = [f"xprotect://localhost/cameras/{args.camera}"
                            f"?StartTime={start:%Y-%m-%dT%H:%M:%SZ}&EndTime={end:%Y-%m-%dT%H:%M:%SZ}"]
    summary = call("POST", "/api/Summaries", request, session)
    print(f"Request {summary['Id']}: {start:%H:%M:%S} to {end:%H:%M:%S} UTC")

    progress = None
    deadline = time.monotonic() + 600
    while True:
        if summary["Progress"] != progress:
            progress = summary["Progress"]
            print(f"  {progress}")
        if progress in ("Completed", "Failed") or time.monotonic() > deadline:
            break
        time.sleep(3)
        summary = call("GET", f"/api/Summaries/{summary['Id']}", session=session)

    if progress == "Completed":
        print(summary.get("Response", ""))
    elif progress == "Failed":
        print(f"Failed: {summary.get('LastError', '')}")
    else:
        print("Still running after 10 minutes: see History in Smart Client")

    print("Checking today's allowance...")
    quota = call("GET", "/api/System/Information").get("QuotaInformation")
    print(f"{quota['DailySummaryCount']} of {quota['DailySummaryQuota']} requests used today" if quota
          else "Allowance not available right now")
    call("POST", "/api/Sessions/Logout", {"Id": session}, session)
    sys.exit(0 if progress == "Completed" else 1)

except urllib.error.HTTPError as error:
    sys.exit(f"The gateway answered {error.code}: {error.read().decode('utf-8', 'replace')}")
except OSError as error:
    sys.exit(f"No answer from the gateway at {GATEWAY}: {error}. Is the Hafnia.Vlm.Gateway service running?")

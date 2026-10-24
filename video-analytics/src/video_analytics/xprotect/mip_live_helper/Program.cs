// Console bridge based on Milestone's official MediaLiveViewer component sample.
// Credentials are inherited through environment variables and never passed as arguments.
using System;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Threading;
using VideoOS.Platform;
using VideoOS.Platform.Live;

internal static class Program
{
    private const string DefaultSdkDirectory = @"C:\Program Files\Milestone\XProtect Mobile Server";
    private static readonly Guid IntegrationId = new Guid("65e580da-9148-45cf-8265-27b01008669f");
    private static readonly object StdoutLock = new object();

    private static int Main(string[] args)
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveMilestoneAssembly;
        try { return Run(args); }
        catch (Exception ex)
        {
            Console.Error.WriteLine("MIP live source failed: " + ex.Message);
            return 1;
        }
    }

    private static Assembly ResolveMilestoneAssembly(object sender, ResolveEventArgs args)
    {
        string directory = Environment.GetEnvironmentVariable("XPROTECT_MIPSDK_DIR");
        if (String.IsNullOrWhiteSpace(directory)) directory = DefaultSdkDirectory;
        string path = Path.Combine(directory, new AssemblyName(args.Name).Name + ".dll");
        return File.Exists(path) ? Assembly.LoadFrom(path) : null;
    }

    private static int Run(string[] args)
    {
        if (args.Length != 6)
            throw new ArgumentException("Expected: <server> <camera-guid> <width> <height> <fps> <duration-seconds>");
        Uri server = new Uri(args[0]);
        Guid cameraId = Guid.Parse(args[1]);
        int width = Int32.Parse(args[2], CultureInfo.InvariantCulture);
        int height = Int32.Parse(args[3], CultureInfo.InvariantCulture);
        int fps = Int32.Parse(args[4], CultureInfo.InvariantCulture);
        double duration = Double.Parse(args[5], CultureInfo.InvariantCulture);
        if (width < 1 || height < 1 || fps < 1 || duration <= 0)
            throw new ArgumentException("Width, height, FPS and duration must be positive");

        string username = Environment.GetEnvironmentVariable("XPROTECT_USERNAME");
        string password = Environment.GetEnvironmentVariable("XPROTECT_PASSWORD");
        if (String.IsNullOrWhiteSpace(username) || String.IsNullOrEmpty(password))
            throw new InvalidOperationException("XPROTECT_USERNAME and XPROTECT_PASSWORD are required");

        JPEGLiveSource source = null;
        try
        {
            VideoOS.Platform.SDK.Environment.Initialize();
            VideoOS.Platform.SDK.Media.Environment.Initialize();
            CredentialCache credentials = VideoOS.Platform.Login.Util.BuildCredentialCache(server, username, password, "Basic");
            VideoOS.Platform.SDK.Environment.AddServer(false, server, credentials, true);
            VideoOS.Platform.SDK.Environment.Login(server, IntegrationId, "TraceDump Live Acquisition", "1.0", "TraceDump", true);
            Item camera = VideoOS.Platform.Configuration.Instance.GetItem(cameraId, Kind.Camera);
            if (camera == null)
                throw new InvalidOperationException("Camera was not found or is not accessible: " + cameraId);

            source = new JPEGLiveSource(camera)
            {
                LiveModeStart = true,
                Width = width,
                Height = height,
                FPS = fps,
                KeyFramesOnly = false,
                SingleFrameQueue = true,
                ConnectTimeout = TimeSpan.FromSeconds(15)
            };
            source.LiveContentEvent += OnLiveContent;
            source.Init();
            Console.WriteLine("READY");
            Console.Out.Flush();
            Thread.Sleep(TimeSpan.FromSeconds(duration));
            return 0;
        }
        finally
        {
            if (source != null)
            {
                try { source.LiveModeStart = false; } catch { }
                try { source.Close(); } catch { }
            }
            try { VideoOS.Platform.SDK.Environment.RemoveAllServers(); } catch { }
        }
    }

    private static void OnLiveContent(object sender, EventArgs eventArgs)
    {
        LiveContentEventArgs args = eventArgs as LiveContentEventArgs;
        if (args == null) return;
        if (args.Exception != null)
        {
            Console.Error.WriteLine("LIVE_ERROR:" + args.Exception.Message);
            return;
        }
        if (args.LiveContent == null) return;
        try
        {
            string timestamp = args.LiveContent.BeginTime.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);
            // Live callbacks can overlap. Keep each large base64 record atomic on stdout.
            lock (StdoutLock)
            {
                Console.WriteLine("FRAME|" + timestamp + "|" + Convert.ToBase64String(args.LiveContent.Content));
                Console.Out.Flush();
            }
        }
        finally { args.LiveContent.Dispose(); }
    }
}



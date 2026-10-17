// Console adapter around Milestone's documented MIP SDK MKVExporter.
// The Python CLI passes no secrets on the command line; credentials are read
// from XPROTECT_USERNAME and XPROTECT_PASSWORD in this process environment.
using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Threading;

internal static class Program
{
    private const string DefaultSdkDirectory = @"C:\Program Files\Milestone\XProtect Mobile Server";

    private static int Main(string[] args)
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveMilestoneAssembly;
        try
        {
            return ExporterApp.Run(args);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("MIP export failed: " + ex.Message);
            return 1;
        }
    }

    private static Assembly ResolveMilestoneAssembly(object sender, ResolveEventArgs args)
    {
        string directory = Environment.GetEnvironmentVariable("XPROTECT_MIPSDK_DIR");
        if (String.IsNullOrWhiteSpace(directory))
            directory = DefaultSdkDirectory;
        string name = new AssemblyName(args.Name).Name + ".dll";
        string path = Path.Combine(directory, name);
        return File.Exists(path) ? Assembly.LoadFrom(path) : null;
    }
}

internal static class ExporterApp
{
    private static readonly Guid IntegrationId = new Guid("7d20b5cf-22e7-4fa0-925d-dc95acf0baf7");

    internal static int Run(string[] args)
    {
        if (args.Length == 1 && args[0] == "--list-codecs")
        {
            VideoOS.Platform.SDK.Environment.Initialize();
            VideoOS.Platform.SDK.Export.Environment.Initialize();
            var probe = new VideoOS.Platform.Data.AVIExporter { Width = 320, Height = 240, Filename = "probe.avi" };
            probe.Init();
            foreach (string codec in probe.CodecList)
                Console.WriteLine(codec);
            probe.Close();
            return 0;
        }
        if (args.Length != 6)
            throw new ArgumentException("Expected: <server> <camera-guid> <start-utc> <end-utc> <output-directory> <filename>");

        Uri server = new Uri(args[0]);
        Guid cameraId = Guid.Parse(args[1]);
        DateTime start = ParseUtc(args[2]);
        DateTime end = ParseUtc(args[3]);
        if (start >= end)
            throw new ArgumentException("Start time must be earlier than end time");

        string outputDirectory = Path.GetFullPath(args[4]);
        string filename = args[5];
        if (Path.GetFileName(filename) != filename ||
            !(filename.EndsWith(".mkv", StringComparison.OrdinalIgnoreCase) || filename.EndsWith(".avi", StringComparison.OrdinalIgnoreCase)))
            throw new ArgumentException("Filename must be a plain .mkv or .avi filename");
        Directory.CreateDirectory(outputDirectory);

        string username = Environment.GetEnvironmentVariable("XPROTECT_USERNAME");
        string password = Environment.GetEnvironmentVariable("XPROTECT_PASSWORD");
        if (String.IsNullOrWhiteSpace(username) || String.IsNullOrEmpty(password))
            throw new InvalidOperationException("XPROTECT_USERNAME and XPROTECT_PASSWORD are required");

        VideoOS.Platform.Data.IExporter exporter = null;
        try
        {
            VideoOS.Platform.SDK.Environment.Initialize();
            VideoOS.Platform.SDK.Export.Environment.Initialize();

            CredentialCache credentials = VideoOS.Platform.Login.Util.BuildCredentialCache(server, username, password, "Basic");
            VideoOS.Platform.SDK.Environment.AddServer(false, server, credentials, true);
            VideoOS.Platform.SDK.Environment.Login(
                server,
                IntegrationId,
                "TraceDump Recording Export",
                "1.0",
                "TraceDump",
                true);

            VideoOS.Platform.Item camera = VideoOS.Platform.Configuration.Instance.GetItem(cameraId, VideoOS.Platform.Kind.Camera);
            if (camera == null)
                throw new InvalidOperationException("Camera was not found or is not accessible: " + cameraId);

            if (filename.EndsWith(".avi", StringComparison.OrdinalIgnoreCase))
            {
                exporter = new VideoOS.Platform.Data.AVIExporter
                {
                    Filename = filename,
                    Codec = "Intel IYUV codec",
                    Timestamp = false,
                    AutoSplitExportFile = false
                };
            }
            else
            {
                exporter = new VideoOS.Platform.Data.MKVExporter { Filename = filename };
            }
            exporter.Init();
            exporter.Path = outputDirectory;
            exporter.CameraList.Add(camera);

            if (!exporter.StartExport(start, end))
                throw new InvalidOperationException("Exporter did not start: " + exporter.LastErrorString + " (" + exporter.LastError + ")");

            int previousProgress = Int32.MinValue;
            DateTime deadline = DateTime.UtcNow.AddMinutes(5);
            while (true)
            {
                int progress = exporter.Progress;
                if (progress != previousProgress)
                {
                    Console.WriteLine("PROGRESS:" + progress);
                    previousProgress = progress;
                }
                if (progress >= 100)
                    break;
                if (exporter.LastError > 0)
                    throw new InvalidOperationException("Exporter error: " + exporter.LastErrorString + " (" + exporter.LastError + ")");
                if (DateTime.UtcNow >= deadline)
                {
                    exporter.Cancel();
                    throw new TimeoutException("MIP export did not finish within 5 minutes");
                }
                Thread.Sleep(250);
            }

            exporter.EndExport();
            exporter.Close();
            exporter = null;

            string exactPath = Path.Combine(outputDirectory, filename);
            string exportedPath = File.Exists(exactPath)
                ? exactPath
                : Directory.GetFiles(outputDirectory, filename, SearchOption.AllDirectories).FirstOrDefault();
            if (exportedPath == null)
                throw new FileNotFoundException("Exporter completed but the video file was not found", exactPath);
            Console.WriteLine("OUTPUT:" + Path.GetFullPath(exportedPath));
            return 0;
        }
        finally
        {
            if (exporter != null)
            {
                try { exporter.Cancel(); } catch { }
                try { exporter.EndExport(); } catch { }
                try { exporter.Close(); } catch { }
            }
            try { VideoOS.Platform.SDK.Environment.RemoveAllServers(); } catch { }
        }
    }

    private static DateTime ParseUtc(string value)
    {
        DateTime parsed = DateTime.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
        if (parsed.Kind != DateTimeKind.Utc)
            throw new ArgumentException("Timestamp must be UTC and end in Z: " + value);
        return parsed;
    }
}



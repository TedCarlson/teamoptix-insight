<?php

namespace App\Http\Controllers;

use App\Models\CombinedManifest;
use App\Models\DailyServiceWorksheet;
use App\Models\DeliveryManifestPackage;
use App\Models\DeliveryManifestStop;
use App\Models\PickupAssignment;
use App\Models\PickupManifest;
use App\Models\ReorderPuListing;
use App\Models\ScraperConfig;
use App\Models\ServiceAreaStatus;
use App\Models\ServiceAreaSummary;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\File;


class ScraperController extends Controller
{
    private $PAGE_LIMIT = 100;
    public function index(Request $request)
    {
        $folders = File::directories(storage_path('app/public/scraper/Excels'));
        $folders = array_map('basename', $folders);
        $ret = [];

        foreach ($folders as $folder) {
            $date = Carbon::createFromFormat('m-d-Y', $folder)->timestamp;
            $ret[$date] = [];
            foreach (File::files(storage_path('app/public/scraper/Excels/' . $folder)) as $file) {
                $path = str_replace(storage_path('app') . '/public', '', $file->getPathname());
                $ret[$date][] = [
                    "filename" => $file->getFilename(),
                    "url" => Storage::url($path)
                ];
            }
        }

        krsort($ret);

        return view('scraper.index', ["data" => $ret]);
    }

    public function showLog(Request $request, $filename) {
        $path = storage_path('app/public/scraper/Logs') .'/' . $filename;
        
        if (!File::exists($path)) {
            return abort(404, 'File not found.');
        }

        $new_filename = str_replace('daily_scraper_', '', $filename);
        $new_filename = str_replace('service_area_', '', $filename);

        preg_match('/\d+\-\d+\-\d+/', $new_filename, $matches);
        if (count($matches) > 0) {
            $new_filename = $matches[0];
        }
        $date = Carbon::createFromFormat('Y-m-d', $new_filename)->timestamp;

        $fileContents = File::get($path);
        
        // Return a view with the file contents
        return view('scraper.single_log', ['content' => $fileContents, 'filename' => $filename, 'date' => $date]);
    }

    public function logs(Request $request) {
        $files = File::files(storage_path('app/public/scraper/Logs'));

        $ret = [];
        $service_area = [];

        foreach ($files as $file) {
            $filename = $file->getFilename();
            if (str_contains($filename, 'daily_scraper')) {
                $filename = str_replace('daily_scraper_', '', $filename);
                preg_match('/\d+\-\d+\-\d+/', $filename, $matches);
                if (count($matches) > 0) {
                    $filename = $matches[0];
                }
                $date = Carbon::createFromFormat('Y-m-d', $filename)->timestamp;
                $path = str_replace(storage_path('app') . '/public', '', $file->getPathname());
                $ret[$date][] = [
                    'filename' => $file->getFilename(),
                    "url" => Storage::url($path)
                ];
            } else if (str_contains($filename, 'service_area')) {
                $filename = $file->getFilename();
                $filename = str_replace('service_area_', '', $filename);
                preg_match('/\d+\-\d+\-\d+/', $filename, $matches);

                if (count($matches) > 0) {
                    $filename = $matches[0];
                }
                $date = Carbon::createFromFormat('Y-m-d', $filename)->timestamp;
                if (isset($service_area[$date])) {
                    array_pop($ret[$date]);
                } else {
                    $service_area[$date] = 1;
                }
                $path = str_replace(storage_path('app') . '/public', '', $file->getPathname());
                $ret[$date][] = [
                    'filename' => $file->getFilename(),
                    "url" => Storage::url($path)
                ];
            }
        }
        
        krsort($ret);

        return view('scraper.logs', ["data" => $ret]);
    }

    public function admin(Request $request) {
        $data = ScraperConfig::first();

        if ($data == null) {
            $data = ScraperConfig::create([
                'can_scrape' => false,
                'username' => '',
                'password' => ''
            ]);
        }

        return view('admin.index', ["data" => $data]);
    }

    public function adminUpdate(Request $request) {
        $can_scrape = isset( $request->can_scrape );
        $scrape_on_active = isset( $request->scrape_on_active );
        $scrape_on = isset( $request->scrape_on ) ?  date('Y-m-d H:i:s', strtotime($request->scrape_on)) : null;
        
        ScraperConfig::first()->update(['can_scrape' => $can_scrape, 'username' => $request->username ?? '', 'password' => $request->password ?? '', 'scrape_on' => $scrape_on, 'scrape_on_active' => $scrape_on_active, 'scrape_on_progress' => 0, 'continue_on_selection' => '', 'continue_on_option' => 0]);

        return redirect()->route('admin');
    }

    public function fetchTable($table, $limit, $offset, $search)
    {
        switch ($table) {
            case 'DeliveryManifestStop':
                $data = DeliveryManifestStop::offset($offset)->limit($limit)->orderBy('download_date', 'desc')->get();
                $count = DeliveryManifestStop::count();
                return [
                    'data' => $data,
                    'count' => $count
                ];
                break;
            case 'DeliveryManifestPackage':
                $data = DeliveryManifestPackage::offset($offset)->limit($limit)->orderBy('download_date', 'desc')->get();
                $count = DeliveryManifestPackage::count();
                return [
                    'data' => $data,
                    'count' => $count
                ];
                break;
            case 'CombinedManifest':
                $data = CombinedManifest::offset($offset)->limit($limit)->orderBy('download_date', 'desc')->get();
                $count = CombinedManifest::count();
                return [
                    'data' => $data,
                    'count' => $count
                ];
                break;
            case 'PickupAssignment':
                $data = PickupAssignment::offset($offset)->limit($limit)->orderBy('download_date', 'desc')->get();
                $count = PickupAssignment::count();
                return [
                    'data' => $data,
                    'count' => $count
                ];
                break;
            case 'PickupManifest':
                $data = PickupManifest::offset($offset)->limit($limit)->orderBy('download_date', 'desc')->get();
                $count = PickupManifest::count();
                return [
                    'data' => $data,
                    'count' => $count
                ];
                break;
            case 'ReorderPuListing':
                $data = ReorderPuListing::offset($offset)->limit($limit)->orderBy('download_date', 'desc')->get();
                $count = ReorderPuListing::count();
                return [
                    'data' => $data,
                    'count' => $count
                ];
                break;
            case 'ServiceAreaSummary':
                $data = ServiceAreaSummary::offset($offset)->limit($limit)->orderBy('download_date', 'desc')->get();
                $count = ServiceAreaSummary::count();
                return [
                    'data' => $data,
                    'count' => $count
                ];
                break;
            case 'ServiceAreaStatus':
                $data = ServiceAreaStatus::offset($offset)->limit($limit)->orderBy('download_date', 'desc')->get();
                $count = ServiceAreaStatus::count();
                return [
                    'data' => $data,
                    'count' => $count
                ];
                break;
            case 'DailyServiceWorksheet':
                $data = DailyServiceWorksheet::offset($offset)->limit($limit)->orderBy('download_date', 'desc')->get();
                $count = DailyServiceWorksheet::count();
                return [
                    'data' => $data,
                    'count' => $count
                ];
                break;
            default:
                return [
                    'data' => [],
                    'count' => 0
                ];
                break;
        }
    }

    public function delivery_manifest_stop(Request $request)
    {
        $queries = $request->query();

        $search = isset($queries['search']) ? $queries['search'] : '';

        $page = isset($queries['page']) ? $queries['page'] : 1;

        $limit = $this->PAGE_LIMIT;

        $offset = ($page - 1) * $limit;

        $data = $this->fetchTable('DeliveryManifestStop', $limit, $offset, $search);
        
        return view('DeliveryManifestStop', ["data" => $data['data'], "page" => $page, "total_page" => ceil($data['count'] / $this->PAGE_LIMIT), "offset" => $offset + $limit, "limit" => $this->PAGE_LIMIT, "total_items" => $data['count']]);

        // return [
        //     "success" => true,
        //     "items" => $data['data'],
        //     "offset" => $offset + $limit,
        //     "limit" => $limit,
        //     "total_items" => $data['count'],
        //     "total_page" => ceil($data['count'] / $limit)
        // ];
    }

    public function delivery_manifest_package(Request $request)
    {
        $queries = $request->query();

        $search = isset($queries['search']) ? $queries['search'] : '';

        $page = isset($queries['page']) ? $queries['page'] : 1;

        $limit = $this->PAGE_LIMIT;

        $offset = ($page - 1) * $limit;

        $data = $this->fetchTable('DeliveryManifestPackage', $limit, $offset, $search);
        
        return view('DeliveryManifestPackage', ["data" => $data['data'], "page" => $page, "total_page" => ceil($data['count'] / $this->PAGE_LIMIT), "offset" => $offset + $limit, "limit" => $this->PAGE_LIMIT, "total_items" => $data['count']]);
    }

    public function combined_manifest(Request $request)
    {
        $queries = $request->query();

        $search = isset($queries['search']) ? $queries['search'] : '';

        $page = isset($queries['page']) ? $queries['page'] : 1;

        $limit = $this->PAGE_LIMIT;

        $offset = ($page - 1) * $limit;

        $data = $this->fetchTable('CombinedManifest', $limit, $offset, $search);
        
        return view('CombinedManifest', ["data" => $data['data'], "page" => $page, "total_page" => ceil($data['count'] / $this->PAGE_LIMIT), "offset" => $offset + $limit, "limit" => $this->PAGE_LIMIT, "total_items" => $data['count']]);
    }

    public function pickup_assignments(Request $request)
    {
        $queries = $request->query();

        $search = isset($queries['search']) ? $queries['search'] : '';

        $page = isset($queries['page']) ? $queries['page'] : 1;

        $limit = $this->PAGE_LIMIT;

        $offset = ($page - 1) * $limit;

        $data = $this->fetchTable('PickupAssignment', $limit, $offset, $search);
        
        return view('PickupAssignment', ["data" => $data['data'], "page" => $page, "total_page" => ceil($data['count'] / $this->PAGE_LIMIT), "offset" => $offset + $limit, "limit" => $this->PAGE_LIMIT, "total_items" => $data['count']]);
    }

    public function pickup_manifest(Request $request)
    {
        $queries = $request->query();

        $search = isset($queries['search']) ? $queries['search'] : '';

        $page = isset($queries['page']) ? $queries['page'] : 1;

        $limit = $this->PAGE_LIMIT;

        $offset = ($page - 1) * $limit;

        $data = $this->fetchTable('PickupManifest', $limit, $offset, $search);
        
        return view('PickupManifest', ["data" => $data['data'], "page" => $page, "total_page" => ceil($data['count'] / $this->PAGE_LIMIT), "offset" => $offset + $limit, "limit" => $this->PAGE_LIMIT, "total_items" => $data['count']]);
    }

    public function reorder_pu_listings(Request $request)
    {
        $queries = $request->query();

        $search = isset($queries['search']) ? $queries['search'] : '';

        $page = isset($queries['page']) ? $queries['page'] : 1;

        $limit = $this->PAGE_LIMIT;

        $offset = ($page - 1) * $limit;

        $data = $this->fetchTable('ReorderPuListing', $limit, $offset, $search);
        
        return view('ReorderPuListing', ["data" => $data['data'], "page" => $page, "total_page" => ceil($data['count'] / $this->PAGE_LIMIT), "offset" => $offset + $limit, "limit" => $this->PAGE_LIMIT, "total_items" => $data['count']]);
    }

    public function service_area_summary(Request $request)
    {
        $queries = $request->query();

        $search = isset($queries['search']) ? $queries['search'] : '';

        $page = isset($queries['page']) ? $queries['page'] : 1;

        $limit = $this->PAGE_LIMIT;

        $offset = ($page - 1) * $limit;

        $data = $this->fetchTable('ServiceAreaSummary', $limit, $offset, $search);
        
        return view('ServiceAreaSummary', ["data" => $data['data'], "page" => $page, "total_page" => ceil($data['count'] / $this->PAGE_LIMIT), "offset" => $offset + $limit, "limit" => $this->PAGE_LIMIT, "total_items" => $data['count']]);
    }

    public function service_area_status(Request $request)
    {
        $queries = $request->query();

        $search = isset($queries['search']) ? $queries['search'] : '';

        $page = isset($queries['page']) ? $queries['page'] : 1;

        $limit = $this->PAGE_LIMIT;

        $offset = ($page - 1) * $limit;

        $data = $this->fetchTable('ServiceAreaStatus', $limit, $offset, $search);
        
        return view('ServiceAreaStatus', ["data" => $data['data'], "page" => $page, "total_page" => ceil($data['count'] / $this->PAGE_LIMIT), "offset" => $offset + $limit, "limit" => $this->PAGE_LIMIT, "total_items" => $data['count']]);
    }

    public function daily_service_worksheet(Request $request)
    {
        $queries = $request->query();

        $search = isset($queries['search']) ? $queries['search'] : '';

        $page = isset($queries['page']) ? $queries['page'] : 1;

        $limit = $this->PAGE_LIMIT;

        $offset = ($page - 1) * $limit;

        $data = DailyServiceWorksheet::offset($offset)->limit($limit)->orderBy('svc_area', 'asc')->orderBy('driver_name', 'asc')->orderBy('download_date', 'desc')->get();
        $count = DailyServiceWorksheet::count();
        
        return view('DailyServiceWorksheet', ["data" => $data, "page" => $page, "total_page" => ceil($count / $this->PAGE_LIMIT), "offset" => $offset + $limit, "limit" => $this->PAGE_LIMIT, "total_items" => $count]);
    }
}

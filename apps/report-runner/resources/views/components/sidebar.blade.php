@props(['active'])

<div class="flex flex-col m-2 p-2 shadow-md text-black" style="min-width: 250px; max-width: 300px;">
    <div class="w-full" style="position: -webkit-sticky; position: sticky; top: 10px">
        <a href="{{ route('admin') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'admin' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Admin
            </button>
        </a>
        <a href="{{ route('scrapes') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'scrapes' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Scrapes
            </button>
        </a>
        <a href="{{ route('logs') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'logs' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Logs
            </button>
        </a>
        <a href="{{ route('delivery_manifest_stop') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'delivery_manifest_stop' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Delivery Manifest - Stop Details
            </button>
        </a>
        <a href="{{ route('delivery_manifest_package') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'delivery_manifest_package' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Delivery Manifest - Package Details
            </button>
        </a>
        <a href="{{ route('combined_manifest') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'combined_manifest' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Combined Manifest
            </button>
        </a>
        <a href="{{ route('pickup_assignments') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'pickup_assignments' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Pickup Assignments
            </button>
        </a>
        <a href="{{ route('pickup_manifest') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'pickup_manifest' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Pickup Manifest
            </button>
        </a>
        <a href="{{ route('reorder_pu_listings') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'reorder_pu_listings' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Reorder PU Listings
            </button>
        </a>
        <a href="{{ route('service_area_summary') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'service_area_summary' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Service Area Summary
            </button>
        </a>
        <a href="{{ route('service_area_status') }}">
            <button
                class="mb-1 p-2 w-full {{ $active == 'service_area_status' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Service Area Status
            </button>
        </a>
            <a href="{{ route('daily_service_worksheet') }}">
                <button
                class="mb-1 p-2 w-full {{ $active == 'daily_service_worksheet' ? 'bg-sky-400' : 'bg-sky-300' }} hover:bg-sky-500 text-white font-bold">
                Daily Service Worksheet
            </button>
        </a>
    </div>
</div>

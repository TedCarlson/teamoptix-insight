@props(['data'])

{{-- @dd($data) --}}
<x-layout>
    <main class="min-h-screen text-sky-500">
        <x-navbar />
        <div class="flex flex-row w p-2">
            <x-sidebar active="logs" />
            <div class="flex-grow-[8] m-2 shadow-md p-3 text-black">
                <div class="flex flex-col p-2">
                    <h1 class="font-bold my-2 text-xl">{{ date('m-d-Y', (int) $date) }} Log: {{ $filename }}</h1>
                    <div class="flex flex-col">
                        <textarea id="fileContent" class="p-2 border" rows="20" cols="80" readonly>{{ $content }}</textarea>
                    </div>
                </div>
            </div>
        </div>
    </main>

</x-layout>

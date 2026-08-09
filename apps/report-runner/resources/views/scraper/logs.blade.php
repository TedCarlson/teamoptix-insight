@props(['data'])

{{-- @dd($data) --}}
<x-layout>
    <main class="min-h-screen text-sky-500">
        <x-navbar />
        <div class="flex flex-row w p-2">
            <x-sidebar active="logs" />
            <div class="flex-grow-[8] m-2 shadow-md p-3 text-black">
                <div class="flex flex-col p-2">
                    <h1 class="font-bold my-2 text-xl">Logs:</h1>
                    <div class="flex flex-col">
                        @foreach ($data as $date => $_)
                            <h2 class="text-lg underline font-bold">{{ date('m-d-Y', (int) $date) }}</h2>
                            <div class="mx-2 p-2 flex flex-col">
                                @foreach ($data[$date] as $log)
                                    <a class="hover:underline hover:text-sky-500" href="{{ route('logs.show', ['filename' => $log['filename']]) }}" target="_blank">{{ $log['filename'] }}</a>
                                @endforeach
                            </div>
                        @endforeach
                    </div>
                </div>

                <div class="data-container p-2">

                </div>
            </div>
        </div>
    </main>


    <script>
        let data = @json($data);
        // console.log(data)
        const onDateChange = (event) => {
            // updateData(event.target.value);
        }
    </script>

</x-layout>

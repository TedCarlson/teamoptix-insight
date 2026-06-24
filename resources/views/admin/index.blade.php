@props(['data'])

<x-layout>
    <main class="min-h-screen text-sky-500">
        <x-navbar />
        <div class="flex flex-row w p-2">
            <x-sidebar active="admin" />
            <div class="flex-grow-[8] m-2 shadow-md p-3 text-black">
                <p class="font-bold text-lg">Scraping options:</p>
                <form action="{{ route('admin.update') }}" method="post">
                    @csrf
                    <div class="flex flex-row items-center my-2">
                        <label for="username" class="mx-2">Username:</label>
                        <input required type="text" name="username" id="username" class="border-2 p-1 rounded" value="{{ $data->username }}">
                    </div>
                    <div class="flex flex-row items-center my-2">
                        <label for="password" class="mx-2">Password:</label>
                        <input required type="text" name="password" id="password" class="border-2 p-1 rounded" value="{{ $data->password }}">
                    </div>
                    <div class="flex flex-row items-center my-2">
                        <label for="can_scrape" class="mx-2">Scraping:</label>
                        <input {{ $data->can_scrape ? 'checked' : '' }} type="checkbox" name="can_scrape" id="can_scrape" class="w-4 h-4 mx-2">
                    </div>
                    <div class="flex flex-row items-center my-2">
                        <label for="scrape_on" class="mx-2">Scrape specific date:</label>
                        <input value="{{ $data->scrape_on ? date('Y-m-d', strtotime($data->scrape_on)) : '' }}" type="date" name="scrape_on" id="scrape_on" class="mx-2 border-2 p-1">
                    </div>
                    <div class="flex flex-row items-center my-2">
                        <label for="scrape_on_active" class="mx-2">Scrape specific date active:</label>
                        <input {{ $data->scrape_on_active ? 'checked' : '' }} type="checkbox" name="scrape_on_active" id="scrape_on_active" class="w-4 h-4 mx-2">
                    </div>
                    <div class="flex flex-row items-center my-3">
                        <input class="mx-2 px-6 py-1 bg-sky-500 text-white rounded-md hover:bg-sky-600 cursor-pointer" type="submit" class="border-2" value="UPDATE">
                    </div>
                </form>
            </div>
        </div>
    </main>

    <script>
        let data = @json($data);
        // console.log(data)
        const onDateChange = (event) => {
            updateData(event.target.value);
        }

        const addZero = (val) => {
            return val.toString().padStart(2, '0');
        }

        const convertDate = (date) => {
            date = new Date(date);
            return addZero(date.getMonth() + 1) + '-' + addZero(date.getDate()) + '-' + date.getFullYear() + ', ' +
                (date.getHours() % 12 || 12) + ':' + addZero(date.getMinutes()) + ':' +
                addZero(date.getSeconds()) + ' ' + (date.getHours() >= 12 ? 'PM' : 'AM');
        }

        const convertDateWithoutTime = (date) => {
            date = new Date(date);
            return addZero(date.getMonth() + 1) + '-' + addZero(date.getDate()) + '-' + date.getFullYear();
        }

        const updateData = (key) => {
            let date = convertDateWithoutTime(parseInt(key) * 1000);

            let cont = document.querySelector('.data-container');

            let html = '';

            html += `<p class="m-2">${data[key].length} Excels scraped on ${date}</p>`;

            data[key].forEach(e => {
                html += `<div class="flex flex-row items-center my-2">
                    <p class="mx-2">${e.filename}</p>
                    <button class="px-4 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded">
                        <a class="mx-2" href="${e.url}">Download</a>
                    </button>
                </div>`;
            })

            cont.innerHTML = html;
        }

        updateData(Object.keys(data)[0]);

    </script>

</x-layout>

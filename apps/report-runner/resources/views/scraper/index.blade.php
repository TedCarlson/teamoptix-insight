@props(['data'])
{{-- @dd($data) --}}
<x-layout>
    <main class="min-h-screen text-sky-500">
        <x-navbar />
        <div class="flex flex-row w p-2">
            <x-sidebar active="scrapes" />
            <div class="flex-grow-[8] m-2 shadow-md p-3 text-black">
                <div class="flex flex-row items-center">
                    <p class="mx-2">Scraped dates:</p>
                    <select onchange="onDateChange(event)" name="dates" id=""
                        class="p-1 outline-sky-500 border-2 border-sky-300">
                        @foreach ($data as $date => $_)
                            <option value="{{ $date }}">{{ date('m-d-Y', (int) $date) }}</option>
                        @endforeach
                    </select>
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

        updateData(Object.keys(data)[Object.keys(data).length-1]);

    </script>

</x-layout>

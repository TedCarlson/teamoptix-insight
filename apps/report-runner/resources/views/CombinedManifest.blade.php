@props(['data', 'page', 'total_page', 'total_items'])

<x-layout>
    <main class="min-h-screen text-sky-500">
        <x-navbar />
        <div class="flex flex-row w p-2">
            <x-sidebar active="combined_manifest" />
            <div class="flex-grow-[8] m-2 shadow-md p-3 text-black" style="max-width:100%; overflow-x: auto">
                <div class="flex flex-row items-center">
                    <p class="mx-2">Combined Manifest</p>
                    <p class="my-2 total-records">0</p>
                </div>
                <div class="data-container p-2 w-full" style="max-width:100%; overflow-x: auto">
                    <table style="width: max-content; min-width: 100%; overflow-x: auto"
                        class="table-data text-sm text-left text-black rounded border-2">
                        <thead class="uppercase rounded-md w-full" style="border: solid 1px gray;">
                        </thead>
                        <tbody class="w-full visitor-data">
                        </tbody>
                    </table>
                </div>
                <div class="flex flex-row justify-center items-center my-2">
                    <div class="pagination flex flex-row justify-center items-center my-2">

                    </div>
                    <form onsubmit="changePage(event)" class="my-2">
                        <input placeholder="Page" class="mx-2 p-1 manual-pagination border-2" type="number" min='1'
                            max="{{ $total_page }}" style="width: 80px;">
                    </form>
                </div>
            </div>
        </div>
    </main>

    <script>
        let data = @json($data);
        let current_page = @json($page);
        let total_page = @json($total_page);
        let total_items = @json($total_items);

        function formatString(input) {
            return input.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }

        const changePage = (event) => {
            event.preventDefault();
            let page = parseInt(event.target.querySelector('.manual-pagination').value);
            if (page) {
                var urlParams = new URLSearchParams(window.location.search);

                var existingParams = {};
                for (var pair of urlParams.entries()) {
                    existingParams[pair[0]] = pair[1];
                }

                var updatedUrl = window.location.pathname + '?';
                for (var key in existingParams) {
                    if (key == 'page') continue;
                    updatedUrl += key + '=' + existingParams[key] + '&';
                }

                window.location.href = updatedUrl + 'page=' + page;
            }
        }

        const populatePagiation = (curr_page, total_page) => {
            let hash = {};

            for (let i = 1; i <= Math.min(total_page, 3); i++) hash[i] = 1;

            for (let i = Math.max(1, curr_page - 1); i <= Math.min(total_page, curr_page + 1); i++) hash[i] = 1;

            for (let i = Math.max(1, total_page - 2); i <= total_page; i++) hash[i] = 1;

            let pages = Object.keys(hash).sort((a, b) => a - b);
            let prev = 0;

            html = '';

            for (let page of pages) {
                if (page - prev > 1) {
                    html += "<span class='mx-2'>...</span>";
                }

                html +=
                    `<a href="${'?page=' + page}" class="pagination-button ${page == curr_page ? 'active' : ''}">${page}</a>`;
                prev = page;
            }

            document.querySelector('.pagination').innerHTML = html;
        }

        const init = () => {
            let table = document.querySelector('.table-data');
            
            let thead = table.querySelector('thead');
            let tbody = table.querySelector('tbody');

            let thead_html = ''
            let tbody_html = ''

            if (data.length == 0) return

            Object.keys(data[0]).forEach(col => {
                if (col === 'id') return;
                thead_html += `<th scope="col" className="px-6 py-3 text-center cursor-pointer hover:bg-red-700 relative group">
                    <div className="flex flex-row items-center justify-normal">${formatString(col)}</div>
                </th>`
            })

            thead.innerHTML = `<tr class="thead">${thead_html}</tr>`;
            data.forEach(row => {
                tbody_html += `<tr className="bg-slate-200 border-b border-slate-400 hover:bg-slate-300">`;

                Object.keys(row).forEach(col => {
                    if (col === 'id') return;
                    tbody_html += `<td className="px-6 py-4">${row[col]}</td>`
                })

                tbody_html += `</tr>`;
            })
            tbody.innerHTML = tbody_html;

            document.querySelector('.total-records').innerHTML = `Total records: ${total_items}. Showing ${data.length} items`;
            
            populatePagiation(parseInt(current_page), parseInt(total_page));
        }

        init();
    </script>

</x-layout>

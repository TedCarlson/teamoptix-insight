<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    @vite('resources/css/app.css')
    <title>FCMS</title>

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=figtree:400,600&display=swap" rel="stylesheet" />

    <!-- Styles -->
    <style>
        table td {
            text-align: center;
            padding: 5px 20px;
            overflow-wrap: anywhere;
            border: 1px solid gray;
        }

        table th {
            padding: 15px 10px;
            border: 1px solid gray;
            text-align: center;
        }

        tbody tr {
            cursor: pointer;
        }

        .pagination-button {
            user-select: none;
            padding: 6px 12px;
            margin: 2px;
            background-color: rgba(226, 226, 226, 0.71);
            color: #266adf;
            border-radius: 5px;
            cursor: pointer;
        }

        .pagination-button.active {
            background-color: #134aec;
            color: white;
        }

        .pagination-button:hover {
            background-color: #134aec;
            color: white;
        }
    </style>
</head>

<body class="font-sans antialiased">
    {{ $slot }}
</body>

</html>

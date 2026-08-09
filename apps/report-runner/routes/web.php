<?php

use Illuminate\Support\Facades\Route;

Route::middleware('auth')->get('/', function () {
    return view('index');
})->name('home');

Route::middleware('auth')->get('/scrapes', [App\Http\Controllers\ScraperController::class, 'index'])->name('scrapes');

Route::middleware('auth')->get('/logs', [App\Http\Controllers\ScraperController::class, 'logs'])->name('logs');

Route::middleware('auth')->get('/logs/{filename}', [App\Http\Controllers\ScraperController::class, 'showLog'])->name('logs.show');

Route::middleware('auth')->get('/admin', [App\Http\Controllers\ScraperController::class, 'admin'])->name('admin');

Route::middleware('auth')->post('/admin/update', [App\Http\Controllers\ScraperController::class, 'adminUpdate'])->name('admin.update');

Route::middleware('auth')->get('/delivery_manifest_stop', [App\Http\Controllers\ScraperController::class, 'delivery_manifest_stop'])->name('delivery_manifest_stop');

Route::middleware('auth')->get('/delivery_manifest_package', [App\Http\Controllers\ScraperController::class, 'delivery_manifest_package'])->name('delivery_manifest_package');

Route::middleware('auth')->get('/combined_manifest', [App\Http\Controllers\ScraperController::class, 'combined_manifest'])->name('combined_manifest');

Route::middleware('auth')->get('/pickup_assignments', [App\Http\Controllers\ScraperController::class, 'pickup_assignments'])->name('pickup_assignments');

Route::middleware('auth')->get('/pickup_manifest', [App\Http\Controllers\ScraperController::class, 'pickup_manifest'])->name('pickup_manifest');

Route::middleware('auth')->get('/reorder_pu_listings', [App\Http\Controllers\ScraperController::class, 'reorder_pu_listings'])->name('reorder_pu_listings');

Route::middleware('auth')->get('/service_area_summary', [App\Http\Controllers\ScraperController::class, 'service_area_summary'])->name('service_area_summary');

Route::middleware('auth')->get('/service_area_status', [App\Http\Controllers\ScraperController::class, 'service_area_status'])->name('service_area_status');

Route::middleware('auth')->get('/daily_service_worksheet', [App\Http\Controllers\ScraperController::class, 'daily_service_worksheet'])->name('daily_service_worksheet');

Route::get('/login', [App\Http\Controllers\UserController::class, 'login'])->name('login');

Route::post('/auth/login', [App\Http\Controllers\UserController::class, 'authLogin'])->name('users.login');
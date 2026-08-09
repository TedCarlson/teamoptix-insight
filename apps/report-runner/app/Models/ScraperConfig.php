<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ScraperConfig extends Model
{
    use HasFactory;

    protected $fillable = [
        'can_scrape',
        'username',
        'password',
        'scrape_on',
        'scrape_on_progress',
        'scrape_on_active'
    ];

    protected $table = 'scraper_config';
}

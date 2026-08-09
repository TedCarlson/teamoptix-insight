<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('scraper_config', function (Blueprint $table) {
            $table->increments('id');
            $table->boolean('can_scrape')->default(false);
            $table->string('username')->default('');
            $table->string('password')->default('');
            $table->string('continue_on_selection')->default('');
            $table->integer('continue_on_selection_option')->default(0);
            $table->dateTime('scrape_on')->nullable();
            $table->boolean('scrape_on_active')->default(false);
            $table->boolean('scrape_on_progress')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('scraper_config');
    }
};

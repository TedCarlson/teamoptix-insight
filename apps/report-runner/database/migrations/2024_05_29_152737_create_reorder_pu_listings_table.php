<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateReorderPuListingsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('reorder_pu_listings', function (Blueprint $table) {
            $table->increments('id');
            $table->string('shipper')->default('');
            $table->string('name')->default('');
            $table->string('address_line_1', 500)->default('');
            $table->string('address_line_2', 500)->default('');
            $table->string('postal_code')->default('');
            $table->string('ready')->default('');
            $table->string('close')->default('');
            $table->string('dow')->default('');
            $table->string('initial_pu_date')->default('');
            $table->timestamp('download_date');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('reorder_pu_listings');
    }
}

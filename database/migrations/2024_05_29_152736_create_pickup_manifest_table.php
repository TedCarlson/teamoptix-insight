<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePickupManifestTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('pickup_manifest', function (Blueprint $table) {
            $table->increments('id');
            $table->string('pu_list')->default('');
            $table->string('station')->default('');
            $table->string('wa')->default('');
            $table->string('puid')->default('');
            $table->string('type')->default('');
            $table->string('pkgs', 100)->default('');
            $table->string('shipper')->default('');
            $table->string('shipper_name')->default('');
            $table->string('address_line_1', 500)->default('');
            $table->string('address_line_2', 500)->default('');
            $table->string('city')->default('');
            $table->string('state')->default('');
            $table->string('postal_code')->default('');
            $table->string('origin_station_wa')->default('');
            $table->string('ready')->default('');
            $table->string('close')->default('');
            $table->string('pu_closed')->default('');
            $table->string('reas_code')->default('');
            $table->string('pkgs_picked_up')->default('');
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
        Schema::dropIfExists('pickup_manifest');
    }
}

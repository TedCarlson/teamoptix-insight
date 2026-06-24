<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateServiceAreaStatusTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('service_area_status', function (Blueprint $table) {
            $table->increments('id');
            $table->string('station', 100)->default('');
            $table->string('sa')->default('');
            $table->string('wa')->default('');
            $table->string('driver_name')->default('');
            $table->string('user_type')->default('');
            $table->string('last_delivery_time')->default('');
            $table->string('last_delivery_address')->default('');
            $table->string('last_pickup_time')->default('');
            $table->string('last_pickup_address')->default('');
            $table->string('1st_stop_close')->default('');
            $table->string('deliveries_complete')->default('');
            $table->string('pickup_complete')->default('');
            $table->string('final_stop_time')->default('');
            $table->string('last_transmission_time')->default('');
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
        Schema::dropIfExists('service_area_status');
    }
}

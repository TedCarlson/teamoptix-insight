<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateServiceAreaSummaryTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('service_area_summary', function (Blueprint $table) {
            $table->increments('id');
            $table->string('station', 100)->default('');
            $table->string('sa')->default('');
            $table->string('of_work_areas')->default('');
            $table->string('dst')->default('');
            $table->string('delivery_stops_completed')->default('');
            $table->string('packages_delivered')->default('');
            $table->string('pickup_stops_completed')->default('');
            $table->string('packages_picked_up')->default('');
            $table->string('status_coded_packages')->default('');
            $table->string('ils_impacting_packages')->default('');
            $table->string('ils')->default('');
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
        Schema::dropIfExists('service_area_summary');
    }
}

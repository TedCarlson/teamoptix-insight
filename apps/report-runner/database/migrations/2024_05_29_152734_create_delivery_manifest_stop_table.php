<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDeliveryManifestStopTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('delivery_manifest_stop', function (Blueprint $table) {
            $table->increments('id');
            $table->string('st', 100)->default('');
            $table->string('sid', 100)->default('');
            $table->string('pkgs', 100)->default('');
            $table->string('recipient')->default('');
            $table->string('contact_name')->default('');
            $table->string('address_line_1', 500)->default('');
            $table->string('address_line_2', 500)->default('');
            $table->string('city')->default('');
            $table->string('state')->default('');
            $table->string('postal_code')->default('');
            $table->string('stop_instructions')->default('');
            $table->string('phone')->default('');
            $table->string('completed', 100)->default('');
            $table->string('deliverytimebegin', 100)->default('');
            $table->string('deliverytimeend', 100)->default('');
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
        Schema::dropIfExists('delivery_manifest_stop');
    }
}

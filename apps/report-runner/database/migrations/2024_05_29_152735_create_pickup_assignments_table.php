<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePickupAssignmentsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('pickup_assignments', function (Blueprint $table) {
            $table->increments('id');
            $table->string('shipper')->default('');
            $table->string('name')->default('');
            $table->string('contact', 500)->default('');
            $table->string('phone', 500)->default('');
            $table->string('address_line_1', 500)->default('');
            $table->string('address_line_2', 500)->default('');
            $table->string('postal_code')->default('');
            $table->string('ready')->default('');
            $table->string('close')->default('');
            $table->string('dow')->default('');
            $table->string('pickup_type')->default('');
            $table->string('will_call')->default('');
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
        Schema::dropIfExists('pickup_assignments');
    }
}

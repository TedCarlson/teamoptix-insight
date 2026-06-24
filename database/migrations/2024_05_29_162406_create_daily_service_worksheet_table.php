<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDailyServiceWorksheetTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('daily_service_worksheet', function (Blueprint $table) {
            $table->increments('id');
            $table->string('svc_area')->default('');
            $table->string('wa_name')->default('');
            $table->string('veh')->default('');
            $table->string('driver_name')->default('');
            $table->string('wa')->default('');
            $table->string('vscan_pkgs')->default('');
            $table->string('del_stps')->default('');
            $table->string('pu_stps')->default('');
            $table->string('diff')->default('');
            $table->string('act_del_stps')->default('');
            $table->string('act_del_pkgs')->default('');
            $table->string('act_pu_stps')->default('');
            $table->string('act_pu_pkgs')->default('');
            $table->string('ils')->default('');
            $table->string('ils_impact_pkgs')->default('');
            $table->string('non_delvd_stps')->default('');
            $table->string('code_85')->default('');
            $table->string('all_status_code_pkgs')->default('');
            $table->string('pl_ml')->default('');
            $table->string('dna')->default('');
            $table->string('snd_agn')->default('');
            $table->string('excs')->default('');
            $table->string('vsa_vs_star_diff')->default('');
            $table->string('returns_scans')->default('');
            $table->string('miles')->default('');
            $table->string('on_road_hours')->default('');
            $table->string('on_duty_hours')->default('');
            $table->string('pot_dot_hrs_viols')->default('');
            $table->string('next_avail_on_duty')->default('');
            $table->string('pot_miss_pus')->default('');
            $table->string('e_l_pus')->default('');
            $table->string('req_sig')->default('');
            $table->string('date_certain')->default('');
            $table->string('evening')->default('');
            $table->string('appt')->default('');
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
        Schema::dropIfExists('daily_service_worksheet');
    }
}

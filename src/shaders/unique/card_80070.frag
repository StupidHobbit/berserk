#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.35,1.0,length((p-c)/r));
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    vec3 col=scan.rgb;
    float aa=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.719)*6.2831853;
    // Strict illustration window. Three left-side ability medallions and
    // their numeric attachment remain the original scan, including rims.
    float mask=smoothstep(0.130,0.143,p.y)*(1.0-smoothstep(0.542,0.557,p.y));
    mask*=smoothstep(0.006,0.020,p.x)*(1.0-smoothstep(0.980,0.994,p.x));
    mask*=smoothstep(0.060,0.078,length((p-vec2(0.109,0.180))*vec2(1.0,1.411)));
    mask*=smoothstep(0.060,0.078,length((p-vec2(0.108,0.264))*vec2(1.0,1.411)));
    mask*=smoothstep(0.060,0.078,length((p-vec2(0.109,0.340))*vec2(1.0,1.411)));
    mask*=smoothstep(0.030,0.044,length((p-vec2(0.151,0.365))*vec2(1.0,1.411)));

    // Four consecutive attacks: a bright travelling edge and a curved
    // cyan-gold wake on each of her four actual swords, one after another.
    float edges=0.0, wakes=0.0, sparks=0.0;
    for(int i=0;i<4;i++) {
        float n=float(i);
        vec2 h=vec2(0.252,0.202), tip=vec2(0.388,0.110);
        vec2 bend=vec2(-0.023,-0.018);
        if(i==1) { h=vec2(0.668,0.208); tip=vec2(0.607,0.115); bend=vec2(0.036,-0.006); }
        if(i==2) { h=vec2(0.701,0.391); tip=vec2(0.819,0.195); bend=vec2(0.039,0.014); }
        if(i==3) { h=vec2(0.177,0.437); tip=vec2(0.020,0.298); bend=vec2(-0.033,0.020); }
        float cycle=fract(t*0.32-n*0.25+0.07);
        float attack=1.0-smoothstep(0.20,0.33,cycle);
        float travel=clamp(cycle*4.2,0.0,1.0);
        for(int j=0;j<8;j++) {
            float f=float(j)/8.0;
            float g=f+0.125;
            float lag=exp(-pow((f-travel)/0.23,2.0));
            vec2 a=mix(h,tip,f)+bend*sin(f*3.141593)*sin(cycle*9.0);
            vec2 b=mix(h,tip,g)+bend*sin(g*3.141593)*sin(cycle*9.0);
            float d=segment(p,a,b);
            edges=max(edges,(1.0-smoothstep(0.0015,0.0035+aa*0.65,d))*lag*attack);
            wakes=max(wakes,exp(-d*d/0.00018)*lag*attack);
        }
        vec2 head=mix(h,tip,travel)+bend*sin(travel*3.141593)*sin(cycle*9.0);
        sparks+=oval(p,head,vec2(0.015,0.010))*attack;
        // Residual, moving points trace the sharpened steel between attacks.
        float drift=fract(t*0.43+n*0.271+seed*0.04);
        vec2 glint=mix(h,tip,drift);
        sparks+=oval(p,glint,vec2(0.008,0.006))*0.42;
    }
    col+=(1.0-col)*vec3(0.06,0.64,0.95)*wakes*0.66;
    col+=vec3(0.32,0.76,0.91)*edges*0.76;
    col+=vec3(0.80,0.59,0.20)*sparks*0.67;

    // Moonlit sea currents run behind the queen and her coiled tail.
    float sea=smoothstep(0.336,0.365,p.y)*(1.0-smoothstep(0.414,0.439,p.y));
    sea*=smoothstep(0.66,0.72,p.x);
    float water=sin(p.y*300.0+sin(p.x*25.0-t*1.4)*1.8+t*3.4);
    float ripples=pow(max(0.0,water),9.0)*(0.50+0.50*sin(p.x*31.0-t*2.8));
    col+=(1.0-col)*vec3(0.03,0.57,0.80)*sea*ripples*0.52;
    // Gold motes flow from her crown into the surrounding night air.
    for(int k=0;k<10;k++) {
        float n=float(k);
        float flight=fract(t*(0.14+n*0.003)+n*0.117);
        vec2 q=vec2(0.435+sin(n*8.61+flight*5.0+seed)*0.25*flight,
                    0.228-flight*0.100);
        float d=length((p-q)*vec2(1.0,1.411));
        float point=(1.0-smoothstep(0.001,0.003+aa*0.7,d))*sin(flight*3.141593);
        col+=vec3(0.78,0.47,0.07)*point*0.58;
    }
    if(u_is_foil) {
        float face=oval(p,vec2(0.431,0.244),vec2(0.055,0.068));
        float body=oval(p,vec2(0.432,0.404),vec2(0.190,0.170));
        float tail=oval(p,vec2(0.734,0.497),vec2(0.290,0.101));
        float facet=p.x*2.25+p.y*3.7+0.10*sin(p.x*24.0+p.y*12.0);
        vec3 iridescence=0.5+0.5*cos(6.2831853*(facet+t*0.065+vec3(0.03,0.36,0.67)));
        vec3 metallic=mix(2.0*col*iridescence,1.0-2.0*(1.0-col)*(1.0-iridescence),step(vec3(0.5),col));
        float material=(0.43+0.27*body+0.26*tail)*(1.0-face*0.90);
        col=mix(col,metallic,material*0.65);
        float band=pow(0.5+0.5*sin(facet*9.0-t*1.5),8.0);
        col+=(1.0-col)*mix(vec3(0.18,0.60,0.67),iridescence,0.7)*(0.12+band*0.34)*material;
        // Fine metallic scale facets on the painted serpent coils.
        vec2 cell=vec2(p.x*68.0,p.y*83.0);
        cell.x+=mod(floor(cell.y),2.0)*0.5;
        float scale=pow(max(0.0,cos(fract(cell.x)*6.2831853)*sin(fract(cell.y)*3.141593)),6.0);
        col+=(1.0-col)*vec3(0.20,0.67,0.55)*scale*tail*(0.12+band*0.30);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),mask),scan.a);
}
